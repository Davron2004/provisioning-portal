import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AppIcon } from '../../../core/icons/icons';

/**
 * Shown when there is nothing to list yet. Project buttons for the next step.
 *
 *   <app-empty-state icon="inbox" heading="No orders yet" message="Orders you submit appear here.">
 *     <a matButton="filled" routerLink="new">New order</a>
 *   </app-empty-state>
 */
@Component({
  selector: 'app-empty-state',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="icon-wrap" aria-hidden="true">
      <mat-icon [svgIcon]="icon()" />
    </div>
    <h2 class="heading">{{ heading() }}</h2>
    @if (message()) {
      <p class="message">{{ message() }}</p>
    }
    <div class="actions"><ng-content /></div>
  `,
  styleUrl: './empty-state.scss',
})
export class EmptyState {
  readonly icon = input<AppIcon>('inbox');
  readonly heading = input.required<string>();
  readonly message = input<string>();
}
