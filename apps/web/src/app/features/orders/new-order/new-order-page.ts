import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { OrderDraft, OrderPreview } from '@provisioning/contracts';
import { finalize } from 'rxjs';
import { toApiProblem, validationIssues } from '../../../core/api/api-problem';
import { OrdersApi } from '../../../core/api/orders-api';
import { NotificationService } from '../../../core/notifications/notification';
import { countOf } from '../../../shared/format/labels';
import { Breadcrumb, Breadcrumbs } from '../../../shared/ui/breadcrumbs/breadcrumbs';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Skeleton } from '../../../shared/ui/skeleton/skeleton';
import { accountDirectory } from '../account-directory';
import { OrderBuilder } from '../order-builder/order-builder';
import { DraftHandoff, OrderDraftHandoff } from '../order-draft-handoff';
import { OrderForm } from '../order-form/order-form';
import { OrderReview } from '../order-review/order-review';
import { OrderSubmission } from '../order-submission';
import {
  GuardsUnsavedChanges,
  UnsavedChangesPrompt,
  confirmBeforeUnload,
} from '../../../core/navigation/unsaved-changes';

type Step = 'build' | 'review';

interface Reviewed {
  readonly preview: OrderPreview;
  readonly draft: OrderDraft;
}

/**
 * `/accounts/:accountId/orders/new`: build an order line by line, preview it (the
 * server resolves and validates it), review the diff, then submit. Nothing is
 * provisioned before the submit. Ctrl/⌘ + Enter previews from anywhere in the form.
 */
@Component({
  selector: 'app-new-order-page',
  imports: [
    Breadcrumbs,
    ErrorState,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    OrderBuilder,
    OrderReview,
    PageHeader,
    RouterLink,
    Skeleton,
  ],
  providers: [OrderSubmission],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown.control.enter)': 'shortcutPreview($event)',
    '(keydown.meta.enter)': 'shortcutPreview($event)',
  },
  templateUrl: './new-order-page.html',
  styleUrl: './new-order-page.scss',
})
export class NewOrderPage implements GuardsUnsavedChanges {
  /** Route parameter (bound with withComponentInputBinding). */
  readonly accountId = input.required<string>();

  private readonly ordersApi = inject(OrdersApi);
  private readonly notifications = inject(NotificationService);
  private readonly handoffs = inject(OrderDraftHandoff);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly submission = inject(OrderSubmission);

  protected readonly directory = accountDirectory(() => this.accountId());
  protected readonly form = new OrderForm(() => ({
    sites: this.directory.sites(),
    users: this.directory.users(),
    devices: this.directory.devices(),
  }));

  protected readonly step = signal<Step>('build');
  protected readonly previewing = signal(false);
  protected readonly reviewed = signal<Reviewed | null>(null);
  /** The assistant's draft this order started from, if any. */
  protected readonly handoff = signal<DraftHandoff | null>(null);
  /** Why the last preview attempt did not get to the review. */
  protected readonly buildProblem = signal<string | null>(null);
  private readonly lineCount = signal(0);

  protected readonly accountName = computed(() => this.directory.account()?.name);
  protected readonly breadcrumbs = computed<Breadcrumb[]>(() => [
    { label: 'Accounts', link: '/accounts' },
    { label: this.accountName() ?? 'Account', link: ['/accounts', this.accountId()] },
    { label: 'New order' },
  ]);
  protected readonly subtitle = computed(() => {
    const name = this.accountName();
    if (!name) {
      return undefined;
    }
    return this.step() === 'build'
      ? `Add, change or remove users at ${name}.`
      : `Check what changes at ${name}, then submit.`;
  });
  protected readonly lineLabel = computed(() => countOf(this.lineCount(), 'line'));
  protected readonly modifierKey = /Mac|iPhone|iPad/.test(
    inject(DOCUMENT).defaultView?.navigator.platform ?? '',
  )
    ? '⌘'
    : 'Ctrl';

  /** Lines typed, added, carried over from the assistant, or previewed, and not submitted. */
  private readonly hasUnsavedWork = () =>
    !this.submission.submitted() &&
    (this.form.lines.dirty ||
      this.lineCount() > 1 ||
      this.handoff() !== null ||
      this.step() === 'review');

  constructor() {
    confirmBeforeUnload(this.hasUnsavedWork);

    this.form.lines.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.lineCount.set(this.form.length));

    // Start once the account is loaded: with the assistant's draft, or one blank line.
    let started = false;
    effect(() => {
      if (started || !this.directory.ready()) {
        return;
      }
      started = true;
      untracked(() => {
        const handoff = this.handoffs.take(this.accountId());
        if (handoff) {
          this.handoff.set(handoff);
          this.form.load(handoff.draft);
        } else {
          this.form.addUser();
        }
        this.lineCount.set(this.form.length);
      });
    });
  }

  unsavedChanges(): UnsavedChangesPrompt | null {
    return this.hasUnsavedWork()
      ? {
          title: 'Discard this order?',
          message: 'Nothing has been submitted. Leaving now discards the lines in this order.',
          confirmLabel: 'Discard order',
        }
      : null;
  }

  protected requestPreview(): void {
    if (this.previewing() || this.step() !== 'build') {
      return;
    }
    const lines = this.form.lines;
    if (lines.length === 0) {
      this.buildProblem.set('Add at least one line to preview the order.');
      return;
    }
    if (lines.invalid) {
      lines.markAllAsTouched();
      this.buildProblem.set('Some lines need attention. Fix the highlighted fields to preview.');
      this.focusFirstProblem();
      return;
    }
    this.buildProblem.set(null);
    const draft = this.form.toDraft();
    this.previewing.set(true);
    this.ordersApi
      .preview(this.accountId(), draft)
      .pipe(
        finalize(() => this.previewing.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (preview) => {
          // Errors also go on the lines, so "Back to edit" shows where to fix them.
          this.form.applyIssues(preview.issues);
          this.reviewed.set({ preview, draft });
          this.submission.reset();
          this.goTo('review');
        },
        error: (error: unknown) => {
          const problem = toApiProblem(error);
          const issues = validationIssues(problem);
          if (issues.length > 0) {
            this.form.applyIssues(issues);
            this.buildProblem.set(`${problem.message}. Fix the highlighted lines to preview.`);
            this.focusFirstProblem();
          } else {
            this.notifications.error(error);
          }
        },
      });
  }

  protected backToEdit(): void {
    this.goTo('build');
    // The builder is rendered afresh, and binding its controls re-runs their validators,
    // which drops the preview's findings. Put them back on the lines once it is on screen.
    const issues = this.reviewed()?.preview.issues ?? [];
    afterNextRender(() => this.form.applyIssues(issues), { injector: this.injector });
  }

  protected submit(): void {
    const reviewed = this.reviewed();
    if (!reviewed) {
      return;
    }
    const handoff = this.handoff();
    this.submission.submit(reviewed.preview, {
      source: handoff ? 'assistant' : 'manual',
      prompt: handoff?.prompt ?? null,
    });
  }

  protected shortcutPreview(event: Event): void {
    if (this.step() === 'build') {
      event.preventDefault();
      this.requestPreview();
    }
  }

  private goTo(step: Step): void {
    this.step.set(step);
    // Start the new step at the top, with the page heading focused for screen readers.
    afterNextRender(
      () => {
        const heading = this.host.nativeElement.querySelector<HTMLElement>('h1');
        heading?.scrollIntoView?.({ block: 'start' });
        heading?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }

  private focusFirstProblem(): void {
    afterNextRender(
      () => {
        const invalid = this.host.nativeElement.querySelector<HTMLElement>(
          '.mat-form-field-invalid input, .mat-form-field-invalid .mat-mdc-select, .line-error',
        );
        invalid?.scrollIntoView?.({ block: 'center' });
        invalid?.focus?.();
      },
      { injector: this.injector },
    );
  }
}
