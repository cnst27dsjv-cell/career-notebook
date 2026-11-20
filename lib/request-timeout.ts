// Keep the deadline active through response-body reading, not just fetch().
export async function withRequestTimeout<T>(
  action: (signal: AbortSignal) => Promise<T>,
  milliseconds: number,
  message: string,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  try {
    return await action(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) throw new Error(message);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
