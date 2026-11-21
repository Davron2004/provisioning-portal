import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { OrderSummary } from '@provisioning/contracts';
import { orderSourceLabel } from '../../../shared/format/labels';
import {
  HANDSET_LAYOUT,
  MEDIUM_LAYOUT,
  injectMediaQuery,
} from '../../../shared/layout/media-query';
import { RelativeTime } from '../../../shared/ui/relative-time/relative-time';
import { StatusChip } from '../../../shared/ui/status-chip/status-chip';
import { Truncate } from '../../../shared/ui/truncate/truncate';

/** Lines finished of all lines, and the share that succeeded and failed, for the meter. */
export function orderProgress(order: Pick<OrderSummary, 'counts'>) {
  const { total, succeeded, failed } = order.counts;
  const share = (n: number) => (total ? `${(100 * n) / total}%` : '0%');
  return {
    done: succeeded + failed,
    total,
    failed,
    succeededWidth: share(succeeded),
    failedWidth: share(failed),
  };
}

/**
 * The one way orders are listed (the Orders page and an account's Orders tab): a table
 * on wider screens, cards on phones. Every row links to the order.
 *
 *   <app-orders-table [orders]="rows()" [showAccount]="true" />
 */
@Component({
  selector: 'app-orders-table',
  imports: [MatTableModule, RelativeTime, RouterLink, StatusChip, Truncate],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './orders-table.html',
  styleUrl: './orders-table.scss',
})
export class OrdersTable {
  readonly orders = input.required<readonly OrderSummary[]>();
  /** Adds the account column (and the account name on cards), for lists across accounts. */
  readonly showAccount = input(false);

  protected readonly handset = injectMediaQuery(HANDSET_LAYOUT);
  /** Narrower tables leave out the source and submitter (both are on the order page). */
  protected readonly medium = injectMediaQuery(MEDIUM_LAYOUT);
  protected readonly columns = computed(() => [
    'title',
    ...(this.showAccount() ? ['account'] : []),
    'status',
    'progress',
    ...(this.medium() ? [] : ['source', 'submittedBy']),
    'updated',
  ]);
  protected readonly progress = orderProgress;
  protected readonly sourceLabel = orderSourceLabel;
  protected readonly trackById = (_: number, order: OrderSummary) => order.id;
}
