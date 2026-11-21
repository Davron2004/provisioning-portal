import { HttpErrorResponse, HttpRequest } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { CreateOrderRequest, OrderDraft, OrderPreview } from '@provisioning/contracts';
import { provideAppIcons } from '../../../core/icons/icons';
import { textsOf } from '../../../../testing/account-page';
import { FakeApi, provideFakeApi } from '../../../../testing/fake-api';
import { aDevice, aPage, aSite, aUser, anAccount, anOrder } from '../../../../testing/fixtures';
import { provideTestConfig } from '../../../../testing/test-config';
import { OrderDraftHandoff } from '../order-draft-handoff';
import { AddUserLine } from '../order-form/order-form';
import { NewOrderPage } from './new-order-page';

const BASE = '/accounts/acc_northwind';

function previewOf(draft: OrderDraft): OrderPreview {
  return {
    accountId: 'acc_northwind',
    lines: draft.lines.map((line) => {
      if (line.action !== 'add_user') {
        throw new Error('This fake only previews adds');
      }
      return {
        action: 'add_user',
        user: {
          ...line,
          extension: line.extension ?? '2124',
          did: line.did ?? '+16135550100',
          macAddress: line.macAddress ?? null,
        },
      };
    }),
    issues: [],
    summary: { adds: draft.lines.length, updates: 0, removes: 0 },
    valid: true,
  };
}

describe('NewOrderPage', () => {
  let api: FakeApi;

  const setUp = async (
    configure: (fake: FakeApi) => void = () => undefined,
    beforeCreate: () => void = () => undefined,
  ) => {
    api = new FakeApi()
      .on(BASE, anAccount())
      .on(`${BASE}/sites`, aPage([aSite()]))
      .on(`${BASE}/users`, aPage([aUser()]))
      .on(`${BASE}/numbers`, aPage([]))
      .on('/catalog/devices', { items: [aDevice()] })
      .on(`${BASE}/orders/preview`, (request: HttpRequest<unknown>) =>
        previewOf(request.body as OrderDraft),
      )
      .on(`${BASE}/orders`, anOrder({ id: 'ord_new', status: 'submitted' }));
    configure(api);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideAppIcons(), provideTestConfig(), provideFakeApi(api)],
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    beforeCreate();
    const fixture = TestBed.createComponent(NewOrderPage);
    fixture.componentRef.setInput('accountId', 'acc_northwind');
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const page = fixture.componentInstance;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const button = (name: string) =>
      [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
        b.textContent?.includes(name),
      )!;
    const firstLine = () => page['form'].lines.at(0) as AddUserLine;
    return { fixture, host, page, settle, button, firstLine, navigate };
  };

  const fill = (line: AddUserLine) =>
    line.patchValue({
      siteId: 'site_kanata',
      firstName: 'Priya',
      lastName: 'Shah',
      email: 'priya.shah@northwind.example.com',
    });

  it('starts with one blank line once the account has loaded', async () => {
    const { host } = await setUp();
    expect(host.querySelectorAll('app-order-line-editor')).toHaveLength(1);
    expect(host.querySelector('app-breadcrumbs')?.textContent).toContain('Northwind Dental');
  });

  it('does not ask the server about an incomplete order', async () => {
    const { host, settle, button } = await setUp();
    button('Preview order').click();
    await settle();
    expect(api.requestsTo(`${BASE}/orders/preview`)).toHaveLength(0);
    expect(host.querySelector('.problem')?.textContent).toContain('Some lines need attention');
    expect(host.querySelectorAll('.mat-form-field-invalid').length).toBeGreaterThan(0);
  });

  it('previews, reviews and submits the order', async () => {
    const { host, settle, button, firstLine, navigate } = await setUp();
    fill(firstLine());
    button('Preview order').click();
    await settle();

    expect(api.requestsTo(`${BASE}/orders/preview`)[0]?.body).toEqual({
      lines: [
        {
          action: 'add_user',
          siteId: 'site_kanata',
          firstName: 'Priya',
          lastName: 'Shah',
          email: 'priya.shah@northwind.example.com',
          voicemail: true,
          deviceModel: null,
          macAddress: null,
        },
      ],
    });
    expect(host.querySelector('app-order-review')).not.toBeNull();
    expect(host.querySelector('[aria-current="step"]')?.textContent).toContain('Review');

    button('Submit order').click();
    await settle();
    const request = api.requestsTo(`${BASE}/orders`)[0]?.body as CreateOrderRequest;
    expect(request).toMatchObject({ source: 'manual', prompt: null });
    expect(request.lines[0]).toMatchObject({ action: 'add_user' });
    expect(navigate).toHaveBeenCalledWith(['/accounts', 'acc_northwind', 'orders', 'ord_new']);
  });

  it('asks before leaving once something is typed, and not after submitting', async () => {
    const { host, page, settle, button, firstLine } = await setUp();
    expect(page.unsavedChanges()).toBeNull();

    const firstName = host.querySelector<HTMLInputElement>('input[formcontrolname="firstName"]')!;
    firstName.value = 'Priya';
    firstName.dispatchEvent(new Event('input'));
    await settle();
    expect(page.unsavedChanges()?.title).toBe('Discard this order?');

    fill(firstLine());
    button('Preview order').click();
    await settle();
    button('Submit order').click();
    await settle();
    expect(page.unsavedChanges()).toBeNull();
  });

  it('goes back to the lines as they were', async () => {
    const { host, settle, button, firstLine } = await setUp();
    fill(firstLine());
    button('Preview order').click();
    await settle();
    button('Back to edit').click();
    await settle();
    expect(host.querySelector('app-order-review')).toBeNull();
    expect(host.querySelector<HTMLInputElement>('input[formcontrolname="firstName"]')?.value).toBe(
      'Priya',
    );
  });

  it('shows what the server rejected on the field it is about', async () => {
    const { host, settle, button, firstLine } = await setUp((fake) =>
      fake.on(`${BASE}/orders/preview`, () => {
        throw new HttpErrorResponse({
          status: 422,
          error: {
            error: {
              code: 'validation_failed',
              message: 'Some lines refer to things that do not exist',
              details: {
                issues: [
                  {
                    lineIndex: 0,
                    field: 'extension',
                    code: 'no_extensions_available',
                    message: 'Kanata Campus has no free extensions left',
                    severity: 'error',
                  },
                ],
              },
            },
          },
        });
      }),
    );
    fill(firstLine());
    button('Preview order').click();
    await settle();

    expect(host.querySelector('app-order-review')).toBeNull();
    expect(textsOf(host, 'mat-error')).toContain('Kanata Campus has no free extensions left');
    expect(host.querySelector('.problem')?.textContent).toContain('Fix the highlighted lines');
  });

  it('continues an order the assistant drafted, and submits it as the assistant’s', async () => {
    const handOver = () =>
      TestBed.inject(OrderDraftHandoff).put({
        accountId: 'acc_northwind',
        prompt: 'add Priya Shah at Kanata',
        draft: {
          lines: [
            {
              action: 'add_user',
              siteId: 'site_kanata',
              firstName: 'Priya',
              lastName: 'Shah',
              email: 'priya.shah@northwind.example.com',
              voicemail: true,
              deviceModel: null,
            },
          ],
        },
      });
    const { host, settle, button } = await setUp(undefined, handOver);
    expect(host.querySelector('.from-assistant')?.textContent).toContain(
      'add Priya Shah at Kanata',
    );

    button('Preview order').click();
    await settle();
    button('Submit order').click();
    await settle();
    expect(api.requestsTo(`${BASE}/orders`)[0]?.body).toMatchObject({
      source: 'assistant',
      prompt: 'add Priya Shah at Kanata',
    });
  });
});
