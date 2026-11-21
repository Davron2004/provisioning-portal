import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DeviceModel, OrderDraft, OrderPreview, Site } from '@provisioning/contracts';
import { toApiProblem } from '../../../core/api/api-problem';
import { AppIcon } from '../../../core/icons/icons';
import { countOf } from '../../../shared/format/labels';
import { HANDSET_LAYOUT, injectMediaQuery } from '../../../shared/layout/media-query';
import { ActionBadge } from './action-badge';
import { DiffValue } from './diff-value';
import { IssueList } from './issue-list';
import {
  REVIEW_FIELDS,
  REVIEW_FIELD_LABELS,
  issueCounts,
  orderIssues,
  reviewRows,
} from './review-model';

/**
 * The review step of an order, shared by the order builder and the assistant: what
 * the order will add, change and remove, as a diff against the account, with every
 * validation finding on the line it is about. Errors block submitting; warnings do not.
 *
 * Presentational: the page owns the preview request and the submit.
 */
@Component({
  selector: 'app-order-review',
  imports: [
    ActionBadge,
    DiffValue,
    IssueList,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-review.html',
  styleUrl: './order-review.scss',
})
export class OrderReview {
  readonly preview = input.required<OrderPreview>();
  /** The draft that was previewed, to tell which values the server assigned. */
  readonly draft = input<OrderDraft | null>(null);
  readonly sites = input<readonly Site[]>([]);
  readonly devices = input<readonly DeviceModel[]>([]);
  readonly submitting = input(false);
  /** Why the last submit failed, if it did. */
  readonly submitError = input<unknown>(null);
  readonly submitLabel = input('Submit order');
  readonly backLabel = input('Back to edit');
  readonly backIcon = input<AppIcon>('arrow_back');

  readonly back = output();
  readonly submitOrder = output();

  protected readonly handset = injectMediaQuery(HANDSET_LAYOUT);
  protected readonly fields = REVIEW_FIELDS;
  protected readonly fieldLabels = REVIEW_FIELD_LABELS;

  protected readonly rows = computed(() =>
    reviewRows(this.preview(), this.draft(), { sites: this.sites(), devices: this.devices() }),
  );
  protected readonly orderIssues = computed(() => orderIssues(this.preview()));
  protected readonly counts = computed(() => issueCounts(this.preview()));
  protected readonly hasAuto = computed(() =>
    this.rows().some((row) => REVIEW_FIELDS.some((field) => row.cells[field].auto)),
  );
  protected readonly summary = computed(() => {
    const { adds, updates, removes } = this.preview().summary;
    return [
      { action: 'add_user' as const, count: adds, label: `${adds} to add` },
      { action: 'update_user' as const, count: updates, label: `${updates} to change` },
      { action: 'remove_user' as const, count: removes, label: `${removes} to remove` },
    ];
  });
  protected readonly verdict = computed(() => {
    const { errors, warnings } = this.counts();
    if (errors > 0) {
      return `${countOf(errors, 'error')} to fix before submitting`;
    }
    return warnings > 0
      ? `Ready to submit, with ${countOf(warnings, 'warning')}`
      : 'Ready to submit';
  });
  protected readonly submitProblem = computed(() => {
    const error = this.submitError();
    return error ? toApiProblem(error).message : null;
  });
  protected readonly canSubmit = computed(() => this.preview().valid && !this.submitting());
}
