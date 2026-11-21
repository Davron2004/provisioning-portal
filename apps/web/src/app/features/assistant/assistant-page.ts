import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { InterpretResponse } from '@provisioning/contracts';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { AccountsApi } from '../../core/api/accounts-api';
import { ApiProblem, toApiProblem } from '../../core/api/api-problem';
import { AssistantApi } from '../../core/api/assistant-api';
import { injectQueryParamsUpdater } from '../../core/routing/query-params';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { Skeleton } from '../../shared/ui/skeleton/skeleton';
import { accountDirectory } from '../orders/account-directory';
import { OrderDraftHandoff } from '../orders/order-draft-handoff';
import { OrderReview } from '../orders/order-review/order-review';
import { OrderSubmission } from '../orders/order-submission';
import { describeOperation, examplePrompts, providerLabel } from './intent-text';
import {
  GuardsUnsavedChanges,
  UnsavedChangesPrompt,
  confirmBeforeUnload,
} from '../../core/navigation/unsaved-changes';

/** The longest request the API accepts (InterpretRequest). */
const MAX_REQUEST = 2000;

interface Interpretation {
  readonly accountId: string;
  /** The request exactly as it was interpreted; the order keeps it. */
  readonly text: string;
  readonly state: 'loading' | 'done' | 'error';
  readonly response?: InterpretResponse;
  readonly error?: unknown;
  readonly problem?: ApiProblem;
}

/**
 * `/assistant?accountId=`: describe a change in plain English, see how it was
 * understood, review the exact order it resolves to, then approve it (or carry it to
 * the order builder). The language model only proposes an intent; nothing is
 * provisioned until the person approves the preview.
 */
@Component({
  selector: 'app-assistant-page',
  imports: [
    ErrorState,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    OrderReview,
    PageHeader,
    RouterLink,
    Skeleton,
  ],
  providers: [OrderSubmission],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './assistant-page.html',
  styleUrl: './assistant-page.scss',
})
export class AssistantPage implements GuardsUnsavedChanges {
  /** Query parameter: `?accountId=`. */
  readonly accountId = input<string>();

  private readonly assistantApi = inject(AssistantApi);
  private readonly router = inject(Router);
  private readonly handoffs = inject(OrderDraftHandoff);
  private readonly updateQuery = injectQueryParamsUpdater();
  protected readonly submission = inject(OrderSubmission);
  protected readonly maxRequest = MAX_REQUEST;

  protected readonly accounts = inject(AccountsApi).list(() => ({}));
  protected readonly accountOptions = computed(() =>
    this.accounts.hasValue() ? (this.accounts.value()?.items ?? []) : [],
  );
  /** The chosen account: from the URL, or picked here. */
  protected readonly selectedAccountId = linkedSignal(() => this.accountId() || undefined);
  protected readonly directory = accountDirectory(() => this.selectedAccountId());

  protected readonly text = signal('');
  protected readonly examples = computed(() =>
    examplePrompts(this.directory.sites(), this.directory.users()),
  );

  private readonly requests = new Subject<{ accountId: string; text: string } | null>();
  protected readonly result = signal<Interpretation | null>(null);

  protected readonly response = computed(() => this.result()?.response);
  protected readonly operations = computed(() =>
    (this.response()?.intent.operations ?? []).map(describeOperation),
  );
  protected readonly provider = computed(() => {
    const response = this.response();
    return response ? providerLabel(response.provider, response.model) : '';
  });
  /** The text was edited after it was interpreted; the result below is for the old one. */
  protected readonly stale = computed(() => {
    const result = this.result();
    return !!result && result.state === 'done' && result.text !== this.text().trim();
  });
  protected readonly canInterpret = computed(
    () =>
      !!this.selectedAccountId() &&
      this.text().trim().length >= 3 &&
      this.result()?.state !== 'loading',
  );

  /** Set when the draft goes on to the builder, which keeps it: nothing is lost. */
  private handingOff = false;
  /** An interpreted order is on screen and not submitted. */
  private readonly hasUnsavedPreview = () =>
    !this.handingOff && !this.submission.submitted() && !!this.response()?.preview;

  constructor() {
    confirmBeforeUnload(this.hasUnsavedPreview);

    // One request at a time: a new one cancels the one in flight.
    this.requests
      .pipe(
        switchMap((request) => {
          if (!request) {
            return of(null);
          }
          return this.assistantApi.interpret(request.accountId, { text: request.text }).pipe(
            map((response): Interpretation => ({ ...request, state: 'done', response })),
            catchError((error: unknown) =>
              of<Interpretation>({
                ...request,
                state: 'error',
                error,
                problem: toApiProblem(error),
              }),
            ),
            startWith<Interpretation>({ ...request, state: 'loading' }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        this.result.set(result);
        this.submission.reset();
      });
  }

  unsavedChanges(): UnsavedChangesPrompt | null {
    return this.hasUnsavedPreview()
      ? {
          title: 'Discard this preview?',
          message:
            'The order the assistant prepared has not been submitted. Leaving now discards it.',
          confirmLabel: 'Discard',
        }
      : null;
  }

  protected selectAccount(accountId: string): void {
    this.selectedAccountId.set(accountId);
    this.requests.next(null);
    void this.updateQuery({ accountId });
  }

  protected useExample(text: string): void {
    this.text.set(text);
    this.interpret();
  }

  protected interpret(): void {
    const accountId = this.selectedAccountId();
    const text = this.text().trim();
    if (!accountId || text.length < 3 || text.length > MAX_REQUEST) {
      return;
    }
    this.requests.next({ accountId, text });
  }

  protected onShortcut(event: Event): void {
    event.preventDefault();
    this.interpret();
  }

  protected approve(): void {
    const result = this.result();
    const preview = result?.response?.preview;
    if (result && preview) {
      this.submission.submit(preview, { source: 'assistant', prompt: result.text });
    }
  }

  /** Opens the order builder with this draft, to change it by hand before submitting. */
  protected editInBuilder(): void {
    const result = this.result();
    const draft = result?.response?.draft;
    if (!result || !draft) {
      return;
    }
    this.handoffs.put({ accountId: result.accountId, draft, prompt: result.text });
    this.handingOff = true;
    void this.router
      .navigate(['/accounts', result.accountId, 'orders', 'new'])
      .finally(() => (this.handingOff = false));
  }
}
