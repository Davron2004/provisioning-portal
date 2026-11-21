import { HttpErrorResponse, HttpRequest } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { CreateOrderRequest, OrderPreview } from '@provisioning/contracts';
import { FakeApi, provideFakeApi } from '../../../testing/fake-api';
import { anOrder } from '../../../testing/fixtures';
import { provideTestConfig } from '../../../testing/test-config';
import { NotificationService } from '../../core/notifications/notification';
import { OrderSubmission } from './order-submission';

const preview = (): OrderPreview => ({
  accountId: 'acc_northwind',
  lines: [
    {
      action: 'remove_user',
      userId: 'usr_0001',
      before: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@northwind.example.com',
        siteId: 'site_kanata',
        extension: '2101',
        did: null,
        voicemail: true,
        deviceModel: null,
        macAddress: null,
      },
    },
  ],
  issues: [],
  summary: { adds: 0, updates: 0, removes: 1 },
  valid: true,
});

describe('OrderSubmission', () => {
  let api: FakeApi;
  let submission: OrderSubmission;
  let navigate: ReturnType<typeof vi.fn>;
  let fail: boolean;

  beforeEach(() => {
    fail = true;
    api = new FakeApi().on('/accounts/acc_northwind/orders', (request: HttpRequest<unknown>) => {
      if (fail) {
        throw new HttpErrorResponse({ status: 0, url: request.url });
      }
      return anOrder({ id: 'ord_new', status: 'submitted' });
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestConfig(),
        provideFakeApi(api),
        OrderSubmission,
        { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn() } },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    submission = TestBed.inject(OrderSubmission);
  });

  const sent = () =>
    api.requestsTo('/accounts/acc_northwind/orders').map((r) => r.body as CreateOrderRequest);

  it('reuses one idempotency key for every attempt at the same preview', () => {
    const reviewed = preview();
    submission.submit(reviewed, { source: 'manual', prompt: null });
    expect(submission.error()).toBeTruthy();
    expect(submission.submitting()).toBe(false);

    fail = false;
    submission.submit(reviewed, { source: 'manual', prompt: null });

    const [first, second] = sent();
    expect(first!.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(second!.idempotencyKey).toBe(first!.idempotencyKey);
    expect(second).toEqual({
      lines: reviewed.lines,
      source: 'manual',
      prompt: null,
      idempotencyKey: first!.idempotencyKey,
    });
    expect(submission.error()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/accounts', 'acc_northwind', 'orders', 'ord_new']);
  });

  it('uses a new key for a new preview, and keeps the assistant’s prompt', () => {
    fail = false;
    submission.submit(preview(), { source: 'manual', prompt: null });
    submission.submit(preview(), { source: 'assistant', prompt: 'remove extension 2101' });

    const [first, second] = sent();
    expect(second!.idempotencyKey).not.toBe(first!.idempotencyKey);
    expect(second).toMatchObject({ source: 'assistant', prompt: 'remove extension 2101' });
  });

  it('never submits a preview with errors', () => {
    submission.submit({ ...preview(), valid: false }, { source: 'manual', prompt: null });
    expect(sent()).toEqual([]);
  });
});
