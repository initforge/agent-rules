import { diffLines, createTwoFilesPatch } from 'diff';

export interface DiffResult {
  hasChanges: boolean;
  patch: string;
  linesAdded: number;
  linesRemoved: number;
  hunks: { oldStart: number; oldLines: number; newStart: number; newLines: number }[];
}

export function computeDiff(oldContent: string, newContent: string, fileName: string = 'file'): DiffResult {
  const changes = diffLines(oldContent, newContent);
  const hunks: DiffResult['hunks'] = [];
  let linesAdded = 0;
  let linesRemoved = 0;
  let oldLine = 1;
  let newLine = 1;
  let hunkStart = -1;
  let hunkOldLines = 0;
  let hunkNewLines = 0;

  for (const change of changes) {
    const count = (change.value.match(/\n/g) || []).length;
    if (change.added) {
      linesAdded += count;
      if (hunkStart === -1) hunkStart = oldLine;
      hunkNewLines += count;
    } else if (change.removed) {
      linesRemoved += count;
      if (hunkStart === -1) hunkStart = oldLine;
      hunkOldLines += count;
    } else {
      if (hunkStart !== -1) {
        hunks.push({ oldStart: hunkStart, oldLines: hunkOldLines, newStart: hunkStart, newLines: hunkNewLines });
        hunkStart = -1;
        hunkOldLines = 0;
        hunkNewLines = 0;
      }
      oldLine += count;
      newLine += count;
      continue;
    }
    if (change.added) newLine += count;
    if (change.removed) oldLine += count;
  }
  if (hunkStart !== -1) {
    hunks.push({ oldStart: hunkStart, oldLines: hunkOldLines, newStart: hunkStart, newLines: hunkNewLines });
  }

  const patch = createTwoFilesPatch(fileName, fileName, oldContent, newContent);

  return {
    hasChanges: linesAdded > 0 || linesRemoved > 0,
    patch,
    linesAdded,
    linesRemoved,
    hunks,
  };
}
