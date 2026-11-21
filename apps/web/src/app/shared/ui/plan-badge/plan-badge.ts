import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { AccountPlan } from '@provisioning/contracts';
import { planLabel } from '../../format/labels';

/** The account's service plan as a quiet outlined tag. Not a status, so no color. */
@Component({
  selector: 'app-plan-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-plan]': 'plan()' },
  template: `{{ label() }}`,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      block-size: 24px;
      padding: 0 var(--app-space-2);
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--app-radius-sm);
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-medium);
      letter-spacing: 0.01em;
      white-space: nowrap;
      vertical-align: middle;
    }
  `,
})
export class PlanBadge {
  readonly plan = input.required<AccountPlan>();
  protected readonly label = computed(() => planLabel(this.plan()));
}
