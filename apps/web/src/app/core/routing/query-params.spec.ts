import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  SEARCH_DEBOUNCE_MS,
  injectQueryParamsUpdater,
  injectSearchParam,
  oneOf,
} from './query-params';

@Component({ template: '' })
class FilterPage {
  readonly q = input<string>();
  readonly update = injectQueryParamsUpdater();
  readonly search = injectSearchParam(this.q);
}

describe('query parameter filters', () => {
  let harness: RouterTestingHarness;
  let page: FilterPage;
  const url = () => TestBed.inject(Router).url;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'list', component: FilterPage }], withComponentInputBinding()),
      ],
    });
    harness = await RouterTestingHarness.create();
    page = await harness.navigateByUrl('/list?sort=name&status=active', FilterPage);
  });

  afterEach(() => vi.useRealTimers());

  it('merges values into the URL and drops empty ones', async () => {
    await page.update({ status: '', plan: 'business' });
    expect(url()).toBe('/list?sort=name&plan=business');
    await page.update({ plan: null, sort: undefined });
    expect(url()).toBe('/list');
  });

  it('replaces the history entry instead of adding one per change', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    await page.update({ plan: 'business' });
    expect(navigate.mock.calls[0]?.[1]).toMatchObject({ replaceUrl: true });
  });

  it('updates the search text at once and the URL when typing pauses', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    page.search.set('a');
    page.search.set('ad');
    expect(page.search.text()).toBe('ad');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);
    expect(url()).toBe('/list?sort=name&status=active');

    vi.advanceTimersByTime(1);
    vi.useRealTimers();
    await harness.fixture.whenStable();
    expect(url()).toBe('/list?sort=name&status=active&q=ad');
  });

  it('follows the URL when it changes from outside', async () => {
    await harness.navigateByUrl('/list?q=grace');
    expect(page.search.text()).toBe('grace');
  });
});

describe('oneOf', () => {
  it('accepts only allowed values', () => {
    expect(oneOf(['a', 'b'] as const, 'b')).toBe('b');
    expect(oneOf(['a', 'b'] as const, 'c')).toBeNull();
    expect(oneOf(['a', 'b'] as const, undefined)).toBeNull();
  });
});
