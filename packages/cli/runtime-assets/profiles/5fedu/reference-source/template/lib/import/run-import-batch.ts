import type { ImportBatchRow, ImportResult, ImportRowError } from './types';

const DEFAULT_BATCH_SIZE = 5;

/**
 * Process import rows in batches with limited concurrency.
 * Failed rows are collected — processing continues for remaining rows.
 */
export async function runImportBatch(
  rows: ImportBatchRow[],
  processRow: (data: Record<string, unknown>, rowNumber: number) => Promise<void>,
  options?: {
    batchSize?: number;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<ImportResult> {
  const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;
  const total = rows.length;
  const failed: ImportRowError[] = [];
  let created = 0;
  let done = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const settled = await Promise.allSettled(
      chunk.map((row) => processRow(row.data, row.rowNumber)),
    );

    settled.forEach((result, index) => {
      const row = chunk[index]!;
      if (result.status === 'fulfilled') {
        created++;
      } else {
        failed.push({
          rowNumber: row.rowNumber,
          message:
            result.reason instanceof Error ? result.reason.message : String(result.reason),
          data: row.data,
        });
      }
      done++;
      options?.onProgress?.(done, total);
    });
  }

  return { created, failed };
}
