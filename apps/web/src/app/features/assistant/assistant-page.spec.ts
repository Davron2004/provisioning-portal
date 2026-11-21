import { By } from '@angular/platform-browser';
import { HttpErrorResponse, HttpRequest } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CreateOrderRequest, InterpretResponse, IntentOperation } from '@provisioning/contracts';
import { provideAppIcons } from '../../core/icons/icons';
import { textsOf } from '../../../testing/account-page';
import { FakeApi, provideFakeApi } from '../../../testing/fake-api';
import { aDevice, aPage, aSite, aUser, anAccount, anOrder } from '../../../testing/fixtures';
import { provideTestConfig } from '../../../testing/test-config';
import { OrderDraftHandoff } from '../orders/order-draft-handoff';
import { AssistantPage } from './assistant-page';
import { describeOperation, examplePrompts, modelName, providerLabel } from './intent-text';

const BASE = '/accounts/acc_northwind';
const target = { site: null, extensions: [], names: [], all: false };

function anInterpretation(overrides: Partial<InterpretResponse> = {}): InterpretResponse {
  const user = {
    firstName: 'New',
    lastName: 'User 01',
    email: 'new.user.kanata.01@northwind.example.com',
    siteId: 'site_kanata',
    voicemail: true,
    deviceModel: null,
  };
  return {
    intent: {
      operations: [
        { op: 'add_users', site: 'Kanata', count: 1, people: [], voicemail: true, device: null },
      ],
      unresolved: [],
    },
    draft: { lines: [{ action: 'add_user', ...user }] },
    preview: {
      accountId: 'acc_northwind',
      lines: [
        {
          action: 'add_user',
          user: { ...user, extension: '2124', did: '+16135550100', macAddress: null },
        },
      ],
      issues: [],
      summary: { adds: 1, updates: 0, removes: 0 },
      valid: true,
    },
    notes: ['Matched "Kanata" to Kanata Campus'],
    provider: 'rules',
    model: null,
    ...overrides,
  };
}

describe('intent text', () => {
  it.each<[IntentOperation, string]>([
    [
      { op: 'add_users', site: 'Kanata', count: 20, people: [], voicemail: true, device: null },
      'Add 20 users at “Kanata”, with voicemail, no device',
    ],
    [
      {
        op: 'add_users',
        site: 'Ottawa HQ',
        count: 3,
        people: [
          { firstName: 'Priya', lastName: 'Shah', email: null },
          { firstName: 'Tom', lastName: 'Lee', email: null },
        ],
        voicemail: false,
        device: 'desk phones',
      },
      'Add Priya Shah and Tom Lee and 1 more user at “Ottawa HQ”, without voicemail, a “desk phones”',
    ],
    [
      {
        op: 'update_users',
        target: { ...target, site: 'Gatineau', all: true },
        set: { voicemail: false, device: null },
      },
      'Turn voicemail off for everyone at “Gatineau”',
    ],
    [
      {
        op: 'update_users',
        target: { ...target, names: ['Tom Lee'] },
        set: { voicemail: true, device: 'none' },
      },
      'Turn voicemail on and remove the device for Tom Lee',
    ],
    [
      { op: 'remove_users', target: { ...target, extensions: ['2101', '2102'] } },
      'Remove extensions 2101 and 2102',
    ],
  ])('describes %j', (operation, text) => {
    expect(describeOperation(operation)).toBe(text);
  });

  it('names the provider honestly', () => {
    expect(providerLabel('rules', null)).toBe('Rules (offline parser, no language model)');
    expect(providerLabel('bedrock', 'anthropic.claude-opus-5-5')).toBe(
      'Claude Opus 5.5 via Amazon Bedrock',
    );
    expect(providerLabel('anthropic', 'claude-sonnet-5')).toBe(
      'Claude Sonnet 5 via the Claude API',
    );
    expect(modelName('some-other-model')).toBe('some-other-model');
  });

  it('builds examples from the account’s own sites and users', () => {
    const sites = [
      aSite({ id: 's1', name: 'Kanata Campus', numbersAvailable: 40 }),
      aSite({ id: 's2', name: 'Ottawa HQ', numbersAvailable: 6 }),
    ];
    const users = [
      aUser({ siteId: 's2', extension: '2002', voicemail: true }),
      aUser({ siteId: 's2', extension: '2001', voicemail: false }),
    ];
    expect(examplePrompts(sites, users).map((e) => e.text)).toEqual([
      'Add 20 users at the Kanata Campus site with voicemail',
      'Add Priya Shah and Tom Lee to Ottawa HQ with desk phones',
      'Turn off voicemail for everyone at Ottawa HQ',
      'Remove extension 2001',
    ]);
    expect(examplePrompts([], users)).toEqual([]);
  });
});

describe('AssistantPage', () => {
  let api: FakeApi;

  const setUp = async (url = '/assistant?accountId=acc_northwind') => {
    api = new FakeApi()
      .on('/accounts', aPage([anAccount(), anAccount({ id: 'acc_other', name: 'Other Co' })]))
      .on(BASE, anAccount())
      .on(`${BASE}/sites`, aPage([aSite()]))
      .on(`${BASE}/users`, aPage([aUser()]))
      .on(`${BASE}/numbers`, aPage([]))
      .on('/catalog/devices', { items: [aDevice()] })
      .on(`${BASE}/assistant/interpret`, anInterpretation())
      .on(`${BASE}/orders`, anOrder({ id: 'ord_new', status: 'submitted' }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [{ path: 'assistant', component: AssistantPage }],
          withComponentInputBinding(),
        ),
        provideAppIcons(),
        provideTestConfig(),
        provideFakeApi(api),
      ],
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    await harness.fixture.whenStable();
    const host = harness.fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    };
    const type = async (text: string) => {
      const box = host.querySelector('textarea')!;
      box.value = text;
      box.dispatchEvent(new Event('input'));
      await settle();
    };
    const button = (name: string) =>
      [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
        b.textContent?.includes(name),
      )!;
    const page = () =>
      harness.fixture.debugElement.query(By.directive(AssistantPage))
        .componentInstance as AssistantPage;
    return { host, settle, type, button, navigate, page };
  };

  it('keeps the account picker disabled until the accounts arrive', () => {
    api = new FakeApi().hold('/accounts');
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideAppIcons(), provideTestConfig(), provideFakeApi(api)],
    });
    const fixture = TestBed.createComponent(AssistantPage);
    fixture.detectChanges();
    const select = (fixture.nativeElement as HTMLElement).querySelector('mat-select')!;
    expect(select.getAttribute('aria-disabled')).toBe('true');
    expect(select.textContent).toContain('Loading accounts');
  });

  it('takes the account from the URL and offers examples that fit it', async () => {
    const { host } = await setUp();
    expect(host.querySelector('mat-select')?.textContent).toContain('Northwind Dental');
    expect(textsOf(host, 'button.example')[0]).toBe(
      'Add 12 users at the Kanata Campus site with voicemail',
    );
  });

  it('interprets, explains, previews and submits only on approval', async () => {
    const { host, settle, type, button, navigate } = await setUp();
    await type('add a user at Kanata');
    button('Interpret').click();
    await settle();

    expect(api.requestsTo(`${BASE}/assistant/interpret`)[0]?.body).toEqual({
      text: 'add a user at Kanata',
    });
    expect(textsOf(host, '.operations li')).toEqual([
      'Add 1 user at “Kanata”, with voicemail, no device',
    ]);
    expect(textsOf(host, '.notes li')).toEqual(['Matched "Kanata" to Kanata Campus']);
    expect(host.querySelector('.provider')?.textContent).toContain(
      'Rules (offline parser, no language model)',
    );
    expect(host.querySelector('.not-yet')?.textContent).toContain('Nothing has been provisioned');
    expect(host.querySelector('app-order-review')).not.toBeNull();
    expect(api.requestsTo(`${BASE}/orders`)).toHaveLength(0);

    button('Approve and submit').click();
    await settle();
    const request = api.requestsTo(`${BASE}/orders`)[0]?.body as CreateOrderRequest;
    expect(request).toMatchObject({ source: 'assistant', prompt: 'add a user at Kanata' });
    expect(navigate).toHaveBeenCalledWith(['/accounts', 'acc_northwind', 'orders', 'ord_new']);
  });

  it('shows what it could not understand, and says so when nothing is left to order', async () => {
    const { host, settle, type, button } = await setUp();
    api.on(
      `${BASE}/assistant/interpret`,
      anInterpretation({
        intent: { operations: [], unresolved: ['order pizza for the team'] },
        draft: null,
        preview: null,
        notes: [],
      }),
    );
    await type('order pizza for the team');
    button('Interpret').click();
    await settle();

    expect(textsOf(host, '.unresolved li')).toEqual(['“order pizza for the team”']);
    expect(host.querySelector('.nothing')?.textContent).toContain('Nothing to order');
    expect(host.querySelector('app-order-review')).toBeNull();
  });

  it('explains when the assistant is unavailable and points to the order builder', async () => {
    const { host, settle, type, button } = await setUp();
    api.on(`${BASE}/assistant/interpret`, (request: HttpRequest<unknown>) => {
      throw new HttpErrorResponse({
        status: 502,
        url: request.url,
        error: {
          error: {
            code: 'assistant_unavailable',
            message: 'The assistant could not answer. Build the order by hand.',
          },
        },
      });
    });
    await type('add a user at Kanata');
    button('Interpret').click();
    await settle();

    expect(host.querySelector('app-error-state')?.textContent).toContain(
      'The assistant could not answer.',
    );
    expect(host.querySelector('.fallback a')?.getAttribute('href')).toBe(
      '/accounts/acc_northwind/orders/new',
    );
  });

  it('hands the draft to the order builder', async () => {
    const { settle, type, button, navigate } = await setUp();
    await type('add a user at Kanata');
    button('Interpret').click();
    await settle();
    button('Edit in order builder').click();

    expect(navigate).toHaveBeenCalledWith(['/accounts', 'acc_northwind', 'orders', 'new']);
    expect(TestBed.inject(OrderDraftHandoff).take('acc_northwind')).toMatchObject({
      prompt: 'add a user at Kanata',
      draft: anInterpretation().draft,
    });
  });

  it('asks before leaving an interpreted order that was not submitted', async () => {
    const { settle, type, button, page } = await setUp();
    expect(page().unsavedChanges()).toBeNull();
    await type('add a user at Kanata');
    button('Interpret').click();
    await settle();
    expect(page().unsavedChanges()?.title).toBe('Discard this preview?');

    button('Approve and submit').click();
    await settle();
    expect(page().unsavedChanges()).toBeNull();
  });

  it('does not ask when the draft moves on to the order builder', async () => {
    const { settle, type, button, page } = await setUp();
    await type('add a user at Kanata');
    button('Interpret').click();
    await settle();
    button('Edit in order builder').click();
    expect(page().unsavedChanges()).toBeNull();
  });

  it('runs an example in one click and notices when the text changes afterwards', async () => {
    const { host, settle, type } = await setUp();
    host.querySelector<HTMLButtonElement>('button.example')!.click();
    await settle();
    expect(api.requestsTo(`${BASE}/assistant/interpret`)).toHaveLength(1);
    expect(host.querySelector('.stale')).toBeNull();

    await type('something else');
    await settle();
    expect(host.querySelector('.stale')?.textContent).toContain('Interpret it again');
  });

  it('does nothing without an account', async () => {
    const { button, type, host } = await setUp('/assistant');
    await type('add a user at Kanata');
    expect(button('Interpret').disabled).toBe(true);
    expect(host.querySelector('.hint')?.textContent).toContain('Choose an account first');
  });
});
