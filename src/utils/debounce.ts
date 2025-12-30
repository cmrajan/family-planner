export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timer: number | undefined;
  return (...args: Parameters<T>) => {
    if (timer) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(() => fn(...args), delayMs);
  };
}
