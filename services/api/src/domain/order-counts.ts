import type { LineStatus, OrderCounts } from '@provisioning/contracts';

export function countLines(lines: readonly { status: LineStatus }[]): OrderCounts {
  const counts: OrderCounts = {
    total: lines.length,
    pending: 0,
    provisioning: 0,
    succeeded: 0,
    failed: 0,
  };
  for (const line of lines) counts[line.status] += 1;
  return counts;
}
