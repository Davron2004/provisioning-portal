/** Human-readable console output for the harness itself (handlers keep their JSON logs). */
const stamp = () => new Date().toISOString().slice(11, 23);

export const log = {
  info: (message: string) => console.log(`${stamp()} [harness] ${message}`),
  warn: (message: string) => console.warn(`${stamp()} [harness] ${message}`),
  error: (message: string, error?: unknown) =>
    console.error(
      `${stamp()} [harness] ${message}`,
      error instanceof Error ? error.stack : (error ?? ''),
    ),
};
