import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { SearchHit, SearchResponse } from '@provisioning/contracts';
import { Observable, Subject } from 'rxjs';
import { SearchApi, SearchQuery } from '../../core/api/search-api';
import { provideAppIcons } from '../../core/icons/icons';
import { textsOf } from '../../../testing/account-page';
import { provideTestConfig } from '../../../testing/test-config';
import { highlightParts, highlightText } from './highlight';
import { HighlightedText } from './highlighted-text';
import { SearchPage } from './search-page';

function aHit(overrides: Partial<SearchHit> = {}): SearchHit {
  return {
    entity: 'user',
    id: 'usr_1',
    accountId: 'acc_northwind',
    accountName: 'Northwind Dental',
    title: 'Camille Thompson',
    subtitle: 'Ext 2410 · (416) 555-0100 · Toronto Lab',
    status: 'active',
    highlight: '<mark>Camille</mark> Thompson',
    ...overrides,
  };
}

const response = (
  hits: SearchHit[],
  total = hits.length,
  totals: Partial<SearchResponse['totals']> = {},
): SearchResponse => ({
  query: 'x',
  total,
  totals: {
    user: hits.filter((hit) => hit.entity === 'user').length,
    number: hits.filter((hit) => hit.entity === 'number').length,
    order: hits.filter((hit) => hit.entity === 'order').length,
    ...totals,
  },
  hits,
  tookMs: 12.4,
});

describe('highlightParts', () => {
  it('splits a fragment into plain and marked text', () => {
    expect(highlightParts('Thea <mark>Camp</mark>bell')).toEqual([
      { text: 'Thea ', mark: false },
      { text: 'Camp', mark: true },
      { text: 'bell', mark: false },
    ]);
  });

  it('decodes escaped text instead of treating it as markup', () => {
    const fragment = '&lt;img src=x onerror=alert(1)&gt; <mark>O&#39;Brien</mark> &amp; co';
    expect(highlightText(fragment)).toBe("<img src=x onerror=alert(1)> O'Brien & co");
  });

  it('renders as text nodes and <mark>s only', async () => {
    const fixture = TestBed.createComponent(HighlightedText);
    fixture.componentRef.setInput('fragment', '&lt;b&gt;bold&lt;/b&gt; <mark>Cam</mark>ille');
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toBe('<b>bold</b> Camille');
    expect(host.querySelector('b')).toBeNull();
    expect([...host.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['Cam']);
  });
});

/** Answers each search with a Subject the test completes, and records cancellations. */
class FakeSearchApi {
  readonly calls: { query: SearchQuery; reply: Subject<SearchResponse>; cancelled: boolean }[] = [];

  find(query: SearchQuery): Observable<SearchResponse> {
    return new Observable<SearchResponse>((subscriber) => {
      const call = { query, reply: new Subject<SearchResponse>(), cancelled: false };
      this.calls.push(call);
      const sub = call.reply.subscribe(subscriber);
      return () => {
        // Torn down before an answer came: the caller cancelled it.
        call.cancelled = !call.reply.closed;
        sub.unsubscribe();
      };
    });
  }

  answer(index: number, body: SearchResponse): void {
    const { reply } = this.calls[index]!;
    reply.next(body);
    reply.complete();
    reply.unsubscribe();
  }
}

describe('SearchPage', () => {
  let api: FakeSearchApi;

  const setUp = async (url: string) => {
    vi.useFakeTimers();
    api = new FakeSearchApi();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'search', component: SearchPage }], withComponentInputBinding()),
        provideAppIcons(),
        provideTestConfig(),
        { provide: SearchApi, useValue: api },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    const host = harness.fixture.nativeElement as HTMLElement;
    const flush = async (ms = 0) => {
      await vi.advanceTimersByTimeAsync(ms);
      harness.fixture.detectChanges();
    };
    await flush();
    const type = async (text: string) => {
      const box = host.querySelector<HTMLInputElement>('input[type="search"]')!;
      box.value = text;
      box.dispatchEvent(new Event('input'));
      await flush();
    };
    return { host, flush, type };
  };

  afterEach(() => vi.useRealTimers());

  it('invites a search when there is no query', async () => {
    const { host } = await setUp('/search');
    expect(api.calls).toHaveLength(0);
    expect(host.querySelector('app-empty-state')?.textContent).toContain('Search everything');
  });

  it('searches the query from the URL at once, grouped by entity in rank order', async () => {
    const { host, flush } = await setUp('/search?q=cam');
    expect(api.calls.map((c) => c.query)).toEqual([{ q: 'cam', entity: null, limit: 50 }]);

    api.answer(
      0,
      response(
        [
          aHit({ entity: 'number', id: '+14165550100', title: '(416) 555-0100', highlight: null }),
          aHit(),
          aHit({ id: 'usr_2', title: 'Thea Campbell', highlight: 'Thea <mark>Camp</mark>bell' }),
        ],
        156,
        { user: 120, number: 36 },
      ),
    );
    await flush();

    expect(textsOf(host, '.group h2')).toEqual(['Numbers 1', 'Users 2']);
    // The chips count every match, not just the page of hits.
    expect(textsOf(host, 'mat-chip-option')).toEqual([
      'All 156',
      'Users 120',
      'Numbers 36',
      'Orders 0',
    ]);
    expect(host.querySelector('.summary')?.textContent).toContain(
      'Top 3 of 156 results · took 12 ms',
    );
    expect(textsOf(host, '.group mark')).toEqual(['Camille', 'Camp']);
  });

  it('waits for typing to pause and cancels a search that is overtaken', async () => {
    const { host, flush, type } = await setUp('/search?q=ca');
    expect(api.calls).toHaveLength(1);

    await type('cam');
    await type('cami');
    expect(api.calls).toHaveLength(1); // still typing
    await flush(250);
    expect(api.calls.map((c) => c.query.q)).toEqual(['ca', 'cami']);
    // The first search was still out: switching to the newer one cancelled it.
    expect(api.calls[0]!.cancelled).toBe(true);

    api.answer(1, response([aHit()]));
    await flush();
    expect(textsOf(host, 'a.hit .title')).toEqual(['Camille Thompson']);
  });

  it('filters by entity through the URL, keeping counts for every entity', async () => {
    const { host, flush } = await setUp('/search?q=cam&entity=order');
    // One request: the API counts every entity even when the hits are filtered.
    expect(api.calls.map((c) => c.query.entity)).toEqual(['order']);
    api.answer(
      0,
      response([aHit({ entity: 'order', id: 'ord_1', title: 'Add 2 users' })], 1, { user: 4 }),
    );
    await flush();

    expect(textsOf(host, '.group h2')).toEqual(['Orders 1']);
    expect(textsOf(host, 'mat-chip-option')).toEqual(['All 5', 'Users 4', 'Numbers 0', 'Orders 1']);

    host.querySelectorAll<HTMLElement>('mat-chip-option .mdc-evolution-chip__action')[0]!.click();
    await flush();
    expect(TestBed.inject(Router).url).toBe('/search?q=cam');
  });

  it('links each hit to where it lives', async () => {
    const { host, flush } = await setUp('/search?q=x');
    api.answer(
      0,
      response([
        aHit(),
        aHit({ entity: 'number', id: '+14165550100', status: 'assigned', highlight: null }),
        aHit({ entity: 'order', id: 'ord_1', status: 'failed', highlight: null }),
      ]),
    );
    await flush();
    expect([...host.querySelectorAll('a.hit')].map((a) => a.getAttribute('href'))).toEqual([
      '/accounts/acc_northwind/users?q=Camille%20Thompson',
      '/accounts/acc_northwind/numbers?status=assigned',
      '/accounts/acc_northwind/orders/ord_1',
    ]);
  });

  it('moves through results with the keyboard', async () => {
    const { host, flush } = await setUp('/search?q=x');
    api.answer(0, response([aHit(), aHit({ id: 'usr_2' }), aHit({ id: 'usr_3' })]));
    await flush();
    const box = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    const links = [...host.querySelectorAll<HTMLElement>('a.hit')];
    const key = (target: HTMLElement, name: string) =>
      target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));

    box.focus();
    key(box, 'ArrowDown');
    expect(document.activeElement).toBe(links[0]);
    key(links[0]!, 'ArrowDown');
    expect(document.activeElement).toBe(links[1]);
    key(links[1]!, 'End');
    expect(document.activeElement).toBe(links[2]);
    key(links[2]!, 'Home');
    key(links[0]!, 'ArrowUp');
    expect(document.activeElement).toBe(box);
  });

  it('says when nothing matches, and offers a retry when the search fails', async () => {
    const { host, flush, type } = await setUp('/search?q=zzz');
    api.answer(0, response([]));
    await flush();
    expect(host.querySelector('app-empty-state')?.textContent).toContain('No matches for “zzz”');

    await type('boom');
    await flush(250);
    api.calls[1]!.reply.error(new Error('down'));
    api.calls[1]!.reply.unsubscribe();
    await flush();
    expect(host.querySelector('app-error-state')).not.toBeNull();

    host.querySelector<HTMLButtonElement>('app-error-state button')!.click();
    await flush();
    expect(api.calls.map((c) => c.query.q)).toEqual(['zzz', 'boom', 'boom']);
  });
});
