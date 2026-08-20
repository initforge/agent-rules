// Per-pixel RGB equality diff with 32px-grid aggregation for paired browser
// parity (AM-0019 §9 non-vision compiler).
// Real 8-bit PNG decoding (zlib + unfiltering) so machine-readable heatmap
// cells map to viewport pixel coordinates — no external image deps.

import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import type { ParityDiffReport, ParityHeatmapCell } from './visual-contracts.js';

export const PIXEL_REGION_NAMES = ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'] as const;

function sha256Bytes(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

interface RawImage {
  width: number;
  height: number;
  stride: number;
  channels: number;
  pixels: Buffer;
}

function decodePng(buffer: Buffer): RawImage | null {
  if (buffer.length < 8 || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (!width || !height || colorType === 3) return null; // palette unsupported
  const channels = [1, 0, 3, 0, 2, 0, 4][colorType] ?? 0;
  if (channels === 0) return null;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(height * stride);
  let rp = 0;
  let prev = Buffer.alloc(stride);
  const paeth = (a: number, b: number, c: number): number => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    if (rp >= raw.length) return null;
    const filter = raw[rp++];
    if (rp + stride > raw.length) return null;
    const row = Buffer.from(raw.subarray(rp, rp + stride));
    rp += stride;
    for (let i = 0; i < stride; i++) {
      const x = i - channels;
      const a = x >= 0 ? row[x] : 0;
      const b = prev[i];
      const c = x >= 0 ? prev[x] : 0;
      if (filter === 1) row[i] = (row[i] + a) & 0xff;
      else if (filter === 2) row[i] = (row[i] + b) & 0xff;
      else if (filter === 3) row[i] = (row[i] + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) row[i] = (row[i] + paeth(a, b, c)) & 0xff;
    }
    row.copy(pixels, y * stride);
    prev = row;
  }
  return { width, height, stride, channels, pixels };
}

export interface PixelDiff {
  expectedHash: string;
  currentHash: string;
  diffHash: string;
  globalDiffPercent: number;
  regionDiffMetrics: ParityDiffReport['pixel']['regionDiffMetrics'];
  heatmapCells: ParityHeatmapCell[];
  decoded: boolean;
}

export function computePixelDiff(ref: Buffer, tgt: Buffer, viewportW: number, viewportH: number): PixelDiff {
  const expectedHash = sha256Bytes(ref);
  const currentHash = sha256Bytes(tgt);
  const refImg = decodePng(ref);
  const tgtImg = decodePng(tgt);

  if (!refImg || !tgtImg) {
    // Fallback: byte-level structural diff (same primitive visual-compiler uses).
    const maxLen = Math.max(ref.length, tgt.length);
    const minLen = Math.min(ref.length, tgt.length);
    let diff = 0;
    for (let i = 0; i < minLen; i++) if (ref[i] !== tgt[i]) diff++;
    diff += maxLen - minLen;
    const globalDiffPercent = maxLen > 0 ? Math.round((diff / maxLen) * 10_000) / 100 : 0;
    return {
      expectedHash,
      currentHash,
      diffHash: sha256Bytes(Buffer.from([])),
      globalDiffPercent,
      regionDiffMetrics: PIXEL_REGION_NAMES.map((region) => ({ region, diffPercent: globalDiffPercent })),
      heatmapCells: [],
      decoded: false,
    };
  }

  const width = Math.min(refImg.width, tgtImg.width, viewportW);
  const height = Math.min(refImg.height, tgtImg.height, viewportH);
  const gridSize = 32;
  const cells: ParityHeatmapCell[] = [];
  for (let gy = 0; gy < height; gy += gridSize) {
    for (let gx = 0; gx < width; gx += gridSize) {
      const gw = Math.min(gridSize, width - gx);
      const gh = Math.min(gridSize, height - gy);
      let diffPixels = 0;
      for (let y = gy; y < gy + gh; y++) {
        const ro = y * refImg.stride + gx * refImg.channels;
        const to = y * tgtImg.stride + gx * tgtImg.channels;
        for (let x = 0; x < gw; x++) {
          const ri = ro + x * refImg.channels;
          const ti = to + x * tgtImg.channels;
          if (refImg.pixels[ri] !== tgtImg.pixels[ti] || refImg.pixels[ri + 1] !== tgtImg.pixels[ti + 1] || refImg.pixels[ri + 2] !== tgtImg.pixels[ti + 2]) {
            diffPixels++;
          }
        }
      }
      cells.push({ x: gx, y: gy, width: gw, height: gh, diffPercent: Math.round((diffPixels / (gw * gh)) * 1000) / 10 });
    }
  }

  let totalDiffPixels = 0;
  let totalPixels = 0;
  for (const c of cells) {
    totalDiffPixels += (c.diffPercent / 100) * c.width * c.height;
    totalPixels += c.width * c.height;
  }
  const globalDiffPercent = totalPixels > 0 ? Math.round((totalDiffPixels / totalPixels) * 10_000) / 100 : 0;

  const cx0 = viewportW * 0.25;
  const cx1 = viewportW * 0.75;
  const cy0 = viewportH * 0.25;
  const cy1 = viewportH * 0.75;
  const regions: Record<string, { d: number; a: number }> = {
    'top-left': { d: 0, a: 0 },
    'top-right': { d: 0, a: 0 },
    center: { d: 0, a: 0 },
    'bottom-left': { d: 0, a: 0 },
    'bottom-right': { d: 0, a: 0 },
  };
  for (const c of cells) {
    const cx = c.x + c.width / 2;
    const cy = c.y + c.height / 2;
    const area = c.width * c.height;
    const diffPx = (c.diffPercent / 100) * area;
    let region: string;
    if (cx >= cx0 && cx <= cx1 && cy >= cy0 && cy <= cy1) region = 'center';
    else if (cy < viewportH / 2) region = cx < viewportW / 2 ? 'top-left' : 'top-right';
    else region = cx < viewportW / 2 ? 'bottom-left' : 'bottom-right';
    regions[region].d += diffPx;
    regions[region].a += area;
  }
  const regionDiffMetrics = PIXEL_REGION_NAMES.map((region) => ({
    region,
    diffPercent: regions[region].a > 0 ? Math.round((regions[region].d / regions[region].a) * 10_000) / 100 : 0,
  }));

  return { expectedHash, currentHash, diffHash: sha256Bytes(refImg.pixels), globalDiffPercent, regionDiffMetrics, heatmapCells: cells, decoded: true };
}
