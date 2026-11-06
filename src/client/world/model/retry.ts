/** Retry only server backpressure; malformed/missing/unauthorized models fail immediately. */
export async function retryModelLoad<T>(load: () => Promise<T>, signal: AbortSignal, wait = abortableDelay): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    try { return await load(); }
    catch (error) {
      const response = (error as { response?: Response } | null)?.response;
      if (signal.aborted) throw signal.reason;
      if (response?.status !== 429 || attempt >= 4) throw error;
      const delay = retryDelay(response.headers.get('retry-after'), attempt);
      // A long server cooldown is not a short transient join burst; do not retry early.
      if (delay > 30_000) throw error;
      await response.body?.cancel();
      await wait(delay, signal);
    }
  }
}
export function retryDelay(header: string | null, attempt: number, now = Date.now()): number {
  const seconds = header !== null && /^\d+(\.\d+)?$/.test(header.trim()) ? Number(header) * 1000 : NaN;
  const date = header ? Date.parse(header) - now : NaN;
  const requested = Number.isFinite(seconds) ? seconds : Number.isFinite(date) ? date : 0;
  return Math.max(1000 * 2 ** attempt, requested);
}
export function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
