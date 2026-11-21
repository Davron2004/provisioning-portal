import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FakeApi, provideFakeApi } from '../../../testing/fake-api';
import { aPage, aUser } from '../../../testing/fixtures';
import { provideTestConfig } from '../../../testing/test-config';
import { pagedList } from './paged-list';
import { UsersApi } from './users-api';

describe('pagedList', () => {
  const PATH = '/accounts/acc_northwind/users';
  const users = (...ids: string[]) => ids.map((id) => aUser({ id }));
  let api: FakeApi;

  const create = (
    siteId = signal<string | null>(null),
    accountId = signal<string | undefined>('acc_northwind'),
  ) => {
    TestBed.configureTestingModule({ providers: [provideTestConfig(), provideFakeApi(api)] });
    const usersApi = TestBed.inject(UsersApi);
    const list = TestBed.runInInjectionContext(() =>
      pagedList(
        () => {
          const id = accountId();
          return id ? { accountId: id, siteId: siteId() } : undefined;
        },
        (request) => usersApi.list(request),
      ),
    );
    return { list, siteId, accountId };
  };
  const settle = async () => {
    TestBed.tick();
    await TestBed.inject(ApplicationRef).whenStable();
  };
  const ids = (items: readonly { id: string }[]) => items.map((item) => item.id);

  beforeEach(() => {
    api = new FakeApi().on(PATH, (request) => {
      const cursor = request.params.get('cursor');
      return cursor === 'c2' ? aPage(users('u3'), null) : aPage(users('u1', 'u2'), 'c2');
    });
  });

  it('stays idle without a query', async () => {
    const { list } = create(signal(null), signal(undefined));
    await settle();
    expect(api.requests).toHaveLength(0);
    expect(list.isFirstLoad()).toBe(false);
    expect(list.items()).toEqual([]);
  });

  it('accumulates pages until there are no more', async () => {
    const { list } = create();
    TestBed.tick();
    expect(list.isFirstLoad()).toBe(true);
    await settle();
    expect(ids(list.items())).toEqual(['u1', 'u2']);
    expect(list.hasMore()).toBe(true);

    list.loadMore();
    TestBed.tick();
    expect(list.isLoadingMore()).toBe(true);
    expect(ids(list.items())).toEqual(['u1', 'u2']);
    await settle();

    expect(ids(list.items())).toEqual(['u1', 'u2', 'u3']);
    expect(list.hasMore()).toBe(false);
    expect(api.requestsTo(PATH).map((r) => r.params.get('cursor'))).toEqual([null, 'c2']);
  });

  it('starts over from the first page when the query changes', async () => {
    const { list, siteId } = create();
    await settle();
    list.loadMore();
    await settle();

    siteId.set('site_ottawa');
    await settle();

    const last = api.requestsTo(PATH).at(-1)!;
    expect(last.params.get('siteId')).toBe('site_ottawa');
    expect(last.params.has('cursor')).toBe(false);
    expect(ids(list.items())).toEqual(['u1', 'u2']);
  });

  it('keeps loaded items when a later page fails, and retries that page only', async () => {
    let fail = true;
    api.on(PATH, (request) => {
      if (request.params.get('cursor') === 'c2') {
        if (fail) {
          fail = false;
          throw new Error('offline');
        }
        return aPage(users('u3'));
      }
      return aPage(users('u1', 'u2'), 'c2');
    });
    const { list } = create();
    await settle();
    list.loadMore();
    await settle();

    expect(list.loadMoreError()).toBeTruthy();
    expect(list.error()).toBeUndefined();
    expect(ids(list.items())).toEqual(['u1', 'u2']);

    list.retry();
    await settle();
    expect(list.loadMoreError()).toBeUndefined();
    expect(ids(list.items())).toEqual(['u1', 'u2', 'u3']);
  });

  it('reports a failed first page as the list error', async () => {
    api.fail(PATH, 500);
    const { list } = create();
    await settle();
    expect(list.error()).toBeTruthy();
    expect(list.isFirstLoad()).toBe(false);
  });
});
