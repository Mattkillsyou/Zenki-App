/**
 * Retry an async operation with exponential backoff.
 *
 * Usage:
 *   await retryAsync(() => pushDataToServer(data), 3, 1000);
 *   // Tries up to 3 times with 1s, 2s, 3s delays between retries.
 */

export async function retryAsync<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delayMs: number = 1000,
): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === retries - 1) throw error;
      const waitMs = delayMs * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  // TypeScript: unreachable, but satisfies return type
  throw new Error('retryAsync: max retries exceeded');
}

/**
 * Fire-and-forget with retry + warning log on final failure.
 * Use for non-critical sync operations.
 */
export function fireAndRetry(
  fn: () => Promise<any>,
  label: string = 'sync',
  retries: number = 3,
): void {
  retryAsync(fn, retries, 1000).catch((err) => {
    console.warn(`[${label}] Failed after ${retries} retries:`, err?.message || err);
  });
}
