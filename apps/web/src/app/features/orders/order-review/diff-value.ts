import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LineAction, ReviewCell } from './review-model';

/**
 * One field of a previewed line, drawn as a diff:
 * - add: the new value, tagged "Auto" when the server assigned it;
 * - change: "before → after" when it changes, the value muted when it does not;
 * - remove: the current value, struck through.
 * Screen readers hear the change in words ("changes from Off to On").
 */
@Component({
  selector: 'app-diff-value',
  imports: [MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-action]': 'action()', '[class.unchanged]': '!cell().changed' },
  template: `
    @let c = cell();
    @switch (action()) {
      @case ('add_user') {
        <span class="value">{{ c.after }}</span>
        @if (c.auto) {
          <span
            class="auto"
            matTooltip="Assigned automatically: the next free one at this site"
            tabindex="0"
            ><span aria-hidden="true">Auto</span
            ><span class="app-visually-hidden">, assigned automatically</span></span
          >
        }
        @if (c.afterDetail) {
          <span class="detail app-numeric">{{ c.afterDetail }}</span>
        }
      }
      @case ('remove_user') {
        <span class="app-visually-hidden">Removes </span>
        <s class="value">{{ c.before }}</s>
        @if (c.beforeDetail) {
          <s class="detail app-numeric">{{ c.beforeDetail }}</s>
        }
      }
      @default {
        @if (c.changed) {
          <span class="app-visually-hidden">Changes from {{ c.before }} to {{ c.after }}</span>
          <span class="change" aria-hidden="true">
            <s class="before">{{ c.before }}</s>
            <mat-icon class="arrow" svgIcon="arrow_forward" />
            <span class="value">{{ c.after }}</span>
          </span>
          @if (c.beforeDetail !== c.afterDetail) {
            <span class="detail app-numeric" aria-hidden="true">
              <s>{{ c.beforeDetail ?? 'No MAC' }}</s> → {{ c.afterDetail ?? 'No MAC' }}
            </span>
          } @else if (c.afterDetail) {
            <span class="detail app-numeric">{{ c.afterDetail }}</span>
          }
        } @else {
          <span class="value">{{ c.after }}</span>
          @if (c.afterDetail) {
            <span class="detail app-numeric">{{ c.afterDetail }}</span>
          }
        }
      }
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 2px var(--app-space-2);
      min-width: 0;
    }
    :host(.unchanged) .value {
      color: var(--mat-sys-on-surface-variant);
    }
    .change {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 2px var(--app-space-1);
    }
    .change .value {
      font-weight: 600;
      color: var(--app-status-info-fg);
    }
    s {
      text-decoration-thickness: 1px;
      color: var(--mat-sys-on-surface-variant);
    }
    :host([data-action='remove_user']) s {
      color: var(--app-status-error-fg);
    }
    .arrow {
      width: 16px;
      height: 16px;
      color: var(--mat-sys-on-surface-variant);
    }
    .auto {
      display: inline-flex;
      align-items: center;
      height: 20px;
      padding: 0 6px;
      border-radius: var(--app-radius-sm);
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
      font: var(--mat-sys-label-small);
      font-weight: 600;
      letter-spacing: 0.02em;
      cursor: help;
    }
    .detail {
      flex-basis: 100%;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class DiffValue {
  readonly cell = input.required<ReviewCell>();
  readonly action = input.required<LineAction>();
}
