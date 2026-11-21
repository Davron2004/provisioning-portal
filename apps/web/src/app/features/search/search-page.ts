import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { SearchEntity, SearchHit, SearchResponse } from '@provisioning/contracts';
import {
  Observable,
  Subject,
  catchError,
  combineLatest,
  debounce,
  distinctUntilChanged,
  map,
  merge,
  of,
  startWith,
  switchMap,
  timer,
} from 'rxjs';
import { SearchApi } from '../../core/api/search-api';
import { AppIcon } from '../../core/icons/icons';
import {
  SEARCH_DEBOUNCE_MS,
  injectQueryParamsUpdater,
  injectSearchParam,
  oneOf,
} from '../../core/routing/query-params';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { Skeleton } from '../../shared/ui/skeleton/skeleton';
import { AnyStatus, STATUS_STYLES } from '../../shared/ui/status-chip/status';
import { StatusChip } from '../../shared/ui/status-chip/status-chip';
import { highlightText } from './highlight';
import { HighlightedText } from './highlighted-text';

/** The most hits the API returns for one query. */
export const SEARCH_LIMIT = 50;

const ENTITIES = SearchEntity.options;

const GROUPS: Readonly<Record<SearchEntity, { label: string; icon: AppIcon }>> = {
  user: { label: 'Users', icon: 'person' },
  number: { label: 'Numbers', icon: 'call' },
  order: { label: 'Orders', icon: 'receipt_long' },
};

interface Query {
  readonly q: string;
  readonly entity: SearchEntity | null;
}

interface SearchState {
  readonly query: Query;
  readonly loading: boolean;
  /** The hits the list shows, and every entity's total for the chips. */
  readonly shown?: SearchResponse;
  readonly error?: unknown;
}

/**
 * `/search?q=&entity=`: users, numbers and orders across every account. Typing
 * searches as you go (debounced, and a newer query cancels the one in flight); the
 * URL follows, so a search can be linked to and the toolbar box lands here.
 * ↓ from the box moves into the results; ↑ ↓ Home End move between them.
 */
@Component({
  selector: 'app-search-page',
  imports: [
    EmptyState,
    ErrorState,
    HighlightedText,
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    PageHeader,
    RouterLink,
    Skeleton,
    StatusChip,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown)': 'navigate($event)' },
  templateUrl: './search-page.html',
  styleUrl: './search-page.scss',
})
export class SearchPage {
  /** Query parameters. */
  readonly q = input<string>();
  readonly entity = input<string>();

  private readonly searchApi = inject(SearchApi);
  private readonly updateQuery = injectQueryParamsUpdater();
  private readonly results = viewChild<ElementRef<HTMLElement>>('results');
  private readonly box = viewChild.required<ElementRef<HTMLInputElement>>('box');

  protected readonly search = injectSearchParam(this.q);
  protected readonly entityFilter = computed(() => oneOf(ENTITIES, this.entity()));
  protected readonly groups = GROUPS;
  protected readonly entities = ENTITIES;

  protected readonly state = signal<SearchState | null>(null);
  private readonly retries = new Subject<Query>();

  protected readonly hits = computed(() => this.state()?.shown?.hits ?? []);
  /** Hits by entity, groups in the order of their best hit (the API ranks across entities). */
  protected readonly grouped = computed(() => {
    const groups = new Map<SearchEntity, SearchHit[]>();
    for (const hit of this.hits()) {
      groups.set(hit.entity, [...(groups.get(hit.entity) ?? []), hit]);
    }
    return [...groups].map(([entity, hits]) => ({ entity, hits }));
  });
  /** Matches per entity (exact, from the API, not just the hits on this page). */
  protected readonly counts = computed(() => this.state()?.shown?.totals);
  protected readonly allCount = computed(() => {
    const counts = this.counts();
    return counts ? ENTITIES.reduce((sum, entity) => sum + counts[entity], 0) : undefined;
  });
  protected readonly summary = computed(() => {
    const shown = this.state()?.shown;
    if (!shown) {
      return '';
    }
    const n = (count: number) => count.toLocaleString('en');
    const results =
      shown.total > shown.hits.length
        ? `Top ${n(shown.hits.length)} of ${n(shown.total)} results`
        : `${n(shown.total)} ${shown.total === 1 ? 'result' : 'results'}`;
    return `${results} · took ${Math.round(shown.tookMs)} ms`;
  });

  constructor() {
    const queries = combineLatest([
      toObservable(this.search.text).pipe(map((text) => text.trim())),
      toObservable(this.entityFilter),
    ]).pipe(map(([q, entity]): Query => ({ q, entity })));

    let last: Query | null = null;
    merge(
      queries.pipe(
        // Wait for typing to pause; a filter or a link applies at once.
        debounce((query) => (last && query.q !== last.q ? timer(SEARCH_DEBOUNCE_MS) : of(0))),
        distinctUntilChanged((a, b) => a.q === b.q && a.entity === b.entity),
      ),
      this.retries,
    )
      .pipe(
        switchMap((query) => {
          last = query;
          return query.q ? this.run(query) : of(null);
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.state.set(state));
  }

  private run(query: Query): Observable<SearchState> {
    const current = this.state();
    return this.searchApi.find({ q: query.q, entity: query.entity, limit: SEARCH_LIMIT }).pipe(
      map((shown): SearchState => ({ query, loading: false, shown })),
      catchError((error: unknown) => of<SearchState>({ query, loading: false, error })),
      // Keep the previous results on screen (dimmed) while the new ones load.
      startWith<SearchState>({ ...current, query, loading: true, error: undefined }),
    );
  }

  protected setEntity(entity: SearchEntity | '' | null | undefined): void {
    void this.updateQuery({ entity: entity || null });
  }

  protected retry(): void {
    const state = this.state();
    if (state) {
      this.retries.next(state.query);
    }
  }

  protected clear(): void {
    this.search.set('');
    this.box().nativeElement.focus();
  }

  /** Where a hit lives: the user or number in its account's tab, or the order itself. */
  protected link(hit: SearchHit): { commands: unknown[]; queryParams: Record<string, string> } {
    switch (hit.entity) {
      case 'user':
        return { commands: ['/accounts', hit.accountId, 'users'], queryParams: { q: hit.title } };
      case 'number':
        return {
          commands: ['/accounts', hit.accountId, 'numbers'],
          queryParams: hit.status ? { status: hit.status } : {},
        };
      case 'order':
        return { commands: ['/accounts', hit.accountId, 'orders', hit.id], queryParams: {} };
    }
  }

  /**
   * Where the highlight goes: in place of the title or subtitle when it is that
   * text, otherwise on a line of its own (e.g. a match in the email or the prompt).
   */
  protected highlightOn(hit: SearchHit): 'title' | 'subtitle' | 'extra' | null {
    if (!hit.highlight) {
      return null;
    }
    const text = highlightText(hit.highlight);
    return text === hit.title ? 'title' : text === hit.subtitle ? 'subtitle' : 'extra';
  }

  protected knownStatus(status: string | null): AnyStatus | null {
    return status && status in STATUS_STYLES ? (status as AnyStatus) : null;
  }

  protected focusFirstResult(event: Event): void {
    const first = this.resultLinks()[0];
    if (first) {
      event.preventDefault();
      first.focus();
    }
  }

  /** Arrow keys, Home and End move between results; Escape goes back to the box. */
  protected navigate(event: KeyboardEvent): void {
    const links = this.resultLinks();
    const index = links.indexOf(event.target as HTMLElement);
    if (index === -1) {
      return;
    }
    const targets: Record<string, HTMLElement | undefined> = {
      ArrowDown: links[index + 1],
      ArrowUp: index === 0 ? this.box().nativeElement : links[index - 1],
      Home: links[0],
      End: links.at(-1),
      Escape: this.box().nativeElement,
    };
    const target = targets[event.key];
    if (target) {
      event.preventDefault();
      target.focus();
    }
  }

  private resultLinks(): HTMLElement[] {
    return [...(this.results()?.nativeElement.querySelectorAll<HTMLElement>('a.hit') ?? [])];
  }
}
