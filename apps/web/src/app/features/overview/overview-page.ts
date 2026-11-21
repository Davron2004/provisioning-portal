import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { ALL_ACCOUNTS } from '@provisioning/contracts';
import { debounceTime, tap } from 'rxjs';
import { OverviewApi } from '../../core/api/overview-api';
import { RealtimeService } from '../../core/realtime/realtime';
import { countOf, orderProgressLabel } from '../../shared/format/labels';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { RelativeTime } from '../../shared/ui/relative-time/relative-time';
import { Skeleton } from '../../shared/ui/skeleton/skeleton';
import { StatusChip } from '../../shared/ui/status-chip/status-chip';
import { UtilizationMeter } from '../../shared/ui/utilization-meter/utilization-meter';
import { applyOrderToOverview } from '../orders/live-orders';
import { OrderStatusBreakdown } from './order-status-breakdown';

/** Counts settle on the server a moment after the push; reload once the burst is over. */
export const OVERVIEW_RELOAD_DEBOUNCE_MS = 1500;

@Component({
  selector: 'app-overview-page',
  imports: [
    EmptyState,
    ErrorState,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    OrderStatusBreakdown,
    PageHeader,
    RelativeTime,
    RouterLink,
    Skeleton,
    StatusChip,
    UtilizationMeter,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './overview-page.html',
  styleUrl: './overview-page.scss',
})
export class OverviewPage {
  protected readonly overview = inject(OverviewApi).overview();
  protected readonly data = computed(() =>
    this.overview.hasValue() ? this.overview.value() : undefined,
  );
  protected readonly skeletonRows = Array.from({ length: 5 });

  protected readonly numbersTotal = computed(() => {
    const data = this.data();
    return data ? data.numbersAssigned + data.numbersAvailable : 0;
  });

  protected readonly progress = orderProgressLabel;
  protected readonly countOf = countOf;

  constructor() {
    // Live: show pushed orders at once, then reload for exact counts once updates settle.
    // Without a WebSocket connection this stream is simply quiet.
    inject(RealtimeService)
      .orderUpdates(ALL_ACCOUNTS)
      .pipe(
        tap((order) => {
          if (this.overview.hasValue()) {
            this.overview.update((overview) => overview && applyOrderToOverview(overview, order));
          }
        }),
        debounceTime(OVERVIEW_RELOAD_DEBOUNCE_MS),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.overview.reload());
  }
}
