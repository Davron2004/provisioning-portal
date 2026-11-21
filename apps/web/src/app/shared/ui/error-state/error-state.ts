import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { toApiProblem } from '../../../core/api/api-problem';

/**
 * A failed load, with the reason and a retry button. Pass the raw error:
 *
 *   @if (accounts.error(); as error) {
 *     <app-error-state [error]="error" (retry)="accounts.reload()" />
 *   }
 */
@Component({
  selector: 'app-error-state',
  imports: [MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'alert' },
  template: `
    <div class="icon-wrap" aria-hidden="true">
      <mat-icon [svgIcon]="problem().code === 'network' ? 'cloud_off' : 'error'" />
    </div>
    <h2 class="heading">{{ heading() }}</h2>
    <p class="message">{{ problem().message }}</p>
    <button matButton="outlined" type="button" (click)="retry.emit()">
      <mat-icon svgIcon="refresh" />
      Try again
    </button>
  `,
  styleUrl: './error-state.scss',
})
export class ErrorState {
  readonly error = input.required<unknown>();
  readonly heading = input('Could not load this');
  readonly retry = output();

  protected readonly problem = computed(() => toApiProblem(this.error()));
}
