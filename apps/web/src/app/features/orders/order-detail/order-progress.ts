import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Order, OrderStatus } from '@provisioning/contracts';
import { AppIcon } from '../../../core/icons/icons';
import { RelativeTime } from '../../../shared/ui/relative-time/relative-time';

type StepState = 'done' | 'current' | 'upcoming' | 'failed';

interface Step {
  readonly label: string;
  readonly state: StepState;
  readonly at: string | null;
}

const ORDER: readonly OrderStatus[] = ['submitted', 'validating', 'provisioning'];

const STEP_ICONS: Readonly<Record<StepState, AppIcon>> = {
  done: 'check',
  current: 'progress_activity',
  upcoming: 'radio_button_unchecked',
  failed: 'close',
};

/** When the order last entered a status, from its event log. */
function lastEntered(order: Order, status: OrderStatus): string | null {
  return [...order.events].reverse().find((event) => event.status === status)?.at ?? null;
}

/**
 * Where an order is in its lifecycle (submitted → validating → provisioning →
 * active | failed) and how far its lines have got, as a segmented bar.
 */
@Component({
  selector: 'app-order-progress',
  imports: [MatIconModule, RelativeTime],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="steps" aria-label="Order progress">
      @for (step of steps(); track step.label; let last = $last) {
        <li
          [attr.data-state]="step.state"
          [attr.aria-current]="step.state === 'current' ? 'step' : null"
        >
          <span class="marker" aria-hidden="true">
            <mat-icon [svgIcon]="icons[step.state]" />
          </span>
          <span class="text">
            <span class="label">{{ step.label }}</span>
            <span class="app-visually-hidden">, {{ stateText[step.state] }}</span>
            @if (step.at) {
              <app-relative-time class="at" [value]="step.at" />
            }
          </span>
        </li>
      }
    </ol>

    <div class="bar-row">
      <div
        class="bar"
        role="progressbar"
        aria-label="Lines finished"
        [attr.aria-valuemin]="0"
        [attr.aria-valuemax]="counts().total"
        [attr.aria-valuenow]="counts().succeeded + counts().failed"
        [attr.aria-valuetext]="summary()"
      >
        @for (segment of segments(); track segment.key) {
          @if (segment.count > 0) {
            <span [class]="'segment ' + segment.key" [style.flex-grow]="segment.count"></span>
          }
        }
      </div>
      <p class="legend app-numeric">
        <span class="key"
          ><span class="swatch succeeded"></span>{{ counts().succeeded }} succeeded</span
        >
        @if (counts().failed > 0) {
          <span class="key"><span class="swatch failed"></span>{{ counts().failed }} failed</span>
        }
        @if (counts().provisioning > 0) {
          <span class="key"
            ><span class="swatch provisioning"></span>{{ counts().provisioning }} in progress</span
          >
        }
        @if (counts().pending > 0) {
          <span class="key"
            ><span class="swatch pending"></span>{{ counts().pending }} waiting</span
          >
        }
        <span class="total">of {{ counts().total }}</span>
      </p>
    </div>
  `,
  styleUrl: './order-progress.scss',
})
export class OrderProgress {
  readonly order = input.required<Order>();

  protected readonly icons = STEP_ICONS;
  protected readonly stateText: Readonly<Record<StepState, string>> = {
    done: 'done',
    current: 'in progress',
    upcoming: 'not started',
    failed: 'failed',
  };
  protected readonly counts = computed(() => this.order().counts);

  protected readonly steps = computed<Step[]>(() => {
    const order = this.order();
    const reached = ORDER.indexOf(order.status);
    const finished = reached === -1;
    const steps: Step[] = ORDER.map((status, index) => ({
      label: status[0]!.toUpperCase() + status.slice(1),
      state: finished || index < reached ? 'done' : index === reached ? 'current' : 'upcoming',
      at: finished || index <= reached ? lastEntered(order, status) : null,
    }));
    steps.push({
      label: order.status === 'failed' ? 'Failed' : 'Active',
      state: order.status === 'failed' ? 'failed' : order.status === 'active' ? 'done' : 'upcoming',
      at: finished ? order.completedAt : null,
    });
    return steps;
  });

  protected readonly segments = computed(() => {
    const { succeeded, failed, provisioning, pending } = this.counts();
    return [
      { key: 'succeeded', count: succeeded },
      { key: 'failed', count: failed },
      { key: 'provisioning', count: provisioning },
      { key: 'pending', count: pending },
    ];
  });

  protected readonly summary = computed(() => {
    const { total, succeeded, failed } = this.counts();
    return `${succeeded + failed} of ${total} lines finished: ${succeeded} succeeded, ${failed} failed`;
  });
}
