/** Kết quả xử lý từng phần tử trong batch (success / fail). */
export type BatchItemResult<T> =
  | { id: string; ok: true; value: T }
  | { id: string; ok: false; error: unknown };

/**
 * Chạy async fn theo lô với giới hạn concurrency — tránh burst request Supabase.
 */
export async function runInBatches<TItem, TResult>(
  items: TItem[],
  batchSize: number,
  fn: (item: TItem) => Promise<TResult>,
): Promise<TResult[]> {
  const results: TResult[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

/**
 * Chạy theo lô; mỗi item trả về BatchItemResult (không throw khi một item lỗi).
 */
export async function runInBatchesSettled<T>(
  ids: string[],
  batchSize: number,
  fn: (id: string) => Promise<T>,
): Promise<BatchItemResult<T>[]> {
  const all: BatchItemResult<T>[] = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const chunk = ids.slice(i, i + batchSize);
    const settled = await Promise.allSettled(chunk.map((id) => fn(id)));
    settled.forEach((result, index) => {
      const id = chunk[index]!;
      if (result.status === 'fulfilled') {
        all.push({ id, ok: true, value: result.value });
      } else {
        all.push({ id, ok: false, error: result.reason });
      }
    });
  }
  return all;
}

/** Ném lỗi tổng hợp nếu có item thất bại. */
export function assertAllBatchSucceeded<T>(results: BatchItemResult<T>[]): void {
  const failed = results.filter((r): r is Extract<BatchItemResult<T>, { ok: false }> => !r.ok);
  if (failed.length === 0) return;
  const messages = failed.map((f) => `${f.id}: ${String(f.error)}`).join('; ');
  throw new Error(messages);
}
