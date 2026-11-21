import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { VoiceUser, VoiceUserPage } from '@provisioning/contracts';
import { aUser } from '../../../testing/fixtures';
import { provideTestConfig } from '../../../testing/test-config';
import { ApiClient, MAX_PAGE_SIZE } from './api-client';

describe('ApiClient.getAll', () => {
  it('follows the cursor until the last page, asking for full pages', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTestConfig()],
    });
    const http = TestBed.inject(HttpTestingController);
    let users: VoiceUser[] | undefined;
    TestBed.inject(ApiClient)
      .getAll(VoiceUserPage, { path: '/accounts/acc_northwind/users' })
      .subscribe((all) => (users = all));

    const first = http.expectOne((r) => r.url.endsWith('/users') && !r.params.has('cursor'));
    expect(first.request.params.get('limit')).toBe(String(MAX_PAGE_SIZE));
    first.flush({ items: [aUser({ id: 'usr_1' })], nextCursor: 'page-2' });

    const second = http.expectOne((r) => r.params.get('cursor') === 'page-2');
    second.flush({ items: [aUser({ id: 'usr_2' })], nextCursor: null });

    expect(users?.map((user) => user.id)).toEqual(['usr_1', 'usr_2']);
    http.verify();
  });
});
