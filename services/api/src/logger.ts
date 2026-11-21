/**
 * Minimal structured logger: one JSON object per line, which CloudWatch Logs
 * Insights can query directly. LOG_LEVEL=debug|info|warn|error|silent (default info).
 */
type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const configured = process.env.LOG_LEVEL;
  if (configured === 'silent') return Number.POSITIVE_INFINITY;
  return order[(configured ?? 'info') as Level] ?? order.info;
}

function write(level: Level, message: string, fields?: Record<string, unknown>): void {
  if (order[level] < threshold()) return;
  const entry = { level, message, ...fields };
  const line = JSON.stringify(entry, (_key, value: unknown) =>
    value instanceof Error
      ? { name: value.name, message: value.message, stack: value.stack }
      : value,
  );
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => write('debug', message, fields),
  info: (message: string, fields?: Record<string, unknown>) => write('info', message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write('warn', message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write('error', message, fields),
};
