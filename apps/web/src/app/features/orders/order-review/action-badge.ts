import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AppIcon } from '../../../core/icons/icons';
import { LineAction } from './review-model';

export const LINE_ACTIONS: Readonly<Record<LineAction, { label: string; icon: AppIcon }>> = {
  add_user: { label: 'Add', icon: 'add' },
  update_user: { label: 'Change', icon: 'edit' },
  remove_user: { label: 'Remove', icon: 'remove' },
};

/** "+ Add", "✎ Change", "− Remove": what an order line does, in its color. */
@Component({
  selector: 'app-action-badge',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-action]': 'action()' },
  template: `
    <mat-icon [svgIcon]="style().icon" aria-hidden="true" />
    {{ label() ?? style().label }}
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 24px;
      padding: 0 10px 0 6px;
      border-radius: var(--app-radius-full);
      background: var(--app-status-success-bg);
      color: var(--app-status-success-fg);
      font: var(--mat-sys-label-medium);
      white-space: nowrap;
    }
    :host([data-action='update_user']) {
      background: var(--app-status-info-bg);
      color: var(--app-status-info-fg);
    }
    :host([data-action='remove_user']) {
      background: var(--app-status-error-bg);
      color: var(--app-status-error-fg);
    }
    mat-icon {
      width: 18px;
      height: 18px;
    }
  `,
})
export class ActionBadge {
  readonly action = input.required<LineAction>();
  /** Overrides the default text, e.g. "3 to add". */
  readonly label = input<string>();
  protected readonly style = computed(() => LINE_ACTIONS[this.action()]);
}
