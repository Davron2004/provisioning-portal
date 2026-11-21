import { BreakpointObserver } from '@angular/cdk/layout';
import { TestBed } from '@angular/core/testing';
import { OrderDraft, OrderPreview, UserSnapshot } from '@provisioning/contracts';
import { of } from 'rxjs';
import { provideAppIcons } from '../../../core/icons/icons';
import { aDevice, aSite } from '../../../../testing/fixtures';
import { textsOf } from '../../../../testing/account-page';
import { OrderReview } from './order-review';

const ada: UserSnapshot = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada.lovelace@northwind.example.com',
  siteId: 'site_kanata',
  extension: '2101',
  did: '+16135550142',
  voicemail: true,
  deviceModel: 'dev_d200',
  macAddress: '00:1A:2B:3C:4D:5E',
};
const priya: UserSnapshot = {
  ...ada,
  firstName: 'Priya',
  lastName: 'Shah',
  email: 'priya.shah@northwind.example.com',
  extension: '2124',
  did: '+16135550100',
  deviceModel: null,
  macAddress: null,
};
const grace: UserSnapshot = { ...ada, firstName: 'Grace', lastName: 'Hopper', extension: '2102' };

function aPreview(overrides: Partial<OrderPreview> = {}): OrderPreview {
  return {
    accountId: 'acc_northwind',
    lines: [
      { action: 'add_user', user: priya },
      {
        action: 'update_user',
        userId: 'usr_0001',
        before: ada,
        after: { ...ada, voicemail: false },
      },
      { action: 'remove_user', userId: 'usr_0002', before: grace },
    ],
    issues: [],
    summary: { adds: 1, updates: 1, removes: 1 },
    valid: true,
    ...overrides,
  };
}

const draft: OrderDraft = {
  lines: [
    {
      action: 'add_user',
      siteId: 'site_kanata',
      firstName: 'Priya',
      lastName: 'Shah',
      email: priya.email,
      voicemail: true,
      deviceModel: null,
    },
    { action: 'update_user', userId: 'usr_0001', changes: { voicemail: false } },
    { action: 'remove_user', userId: 'usr_0002' },
  ],
};

describe('OrderReview', () => {
  const render = async (
    preview: OrderPreview,
    { handset = false, submitting = false, submitError = null as unknown } = {},
  ) => {
    TestBed.configureTestingModule({
      providers: [
        provideAppIcons(),
        {
          provide: BreakpointObserver,
          useValue: { observe: () => of({ matches: handset }), isMatched: () => handset },
        },
      ],
    });
    const fixture = TestBed.createComponent(OrderReview);
    fixture.componentRef.setInput('preview', preview);
    fixture.componentRef.setInput('draft', draft);
    fixture.componentRef.setInput('sites', [aSite()]);
    fixture.componentRef.setInput('devices', [aDevice()]);
    fixture.componentRef.setInput('submitting', submitting);
    fixture.componentRef.setInput('submitError', submitError);
    await fixture.whenStable();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  };

  const rowOf = (host: HTMLElement, index: number) =>
    host.querySelectorAll<HTMLElement>('tbody')[index]!;

  it('summarizes what the order adds, changes and removes', async () => {
    const { host } = await render(aPreview());
    expect(textsOf(host, '.counts li')).toEqual(['1 to add', '1 to change', '1 to remove']);
    expect(host.querySelector('.verdict')?.textContent).toContain('Ready to submit');
  });

  it('leaves out actions the order has none of', async () => {
    const { host } = await render(aPreview({ summary: { adds: 2, updates: 0, removes: 0 } }));
    expect(textsOf(host, '.counts li')).toEqual(['2 to add']);
  });

  it('shows a new user with the values the server assigned tagged as automatic', async () => {
    const { host } = await render(aPreview());
    const add = rowOf(host, 0);
    expect(add.dataset['action']).toBe('add_user');
    expect(add.querySelector('.who')?.textContent).toContain('Priya Shah');
    const autos = add.querySelectorAll('.auto');
    expect(autos).toHaveLength(2); // extension and number, which the draft left out
    expect(autos[0]?.textContent).toContain('assigned automatically');
    expect(add.textContent).toContain('(613) 555-0100');
    expect(add.textContent).toContain('No device');
  });

  it('shows a change as before → after, and leaves unchanged fields quiet', async () => {
    const { host } = await render(aPreview());
    const change = rowOf(host, 1);
    const cells = [...change.querySelectorAll('app-diff-value')];
    const voicemail = cells[3]!;
    expect(voicemail.querySelector('.before')?.textContent).toBe('On');
    expect(voicemail.querySelector('.change .value')?.textContent).toBe('Off');
    expect(voicemail.textContent).toContain('Changes from On to Off');
    expect(cells.filter((cell) => cell.classList.contains('unchanged'))).toHaveLength(4);
  });

  it('strikes through a removal', async () => {
    const { host } = await render(aPreview());
    const removal = rowOf(host, 2);
    expect(removal.dataset['action']).toBe('remove_user');
    expect(removal.querySelector('.name.struck')?.textContent).toBe('Grace Hopper');
    expect(removal.querySelectorAll('app-diff-value s.value')).toHaveLength(5);
  });

  it('puts issues on their line and order-wide issues on top; errors block the submit', async () => {
    const { host } = await render(
      aPreview({
        valid: false,
        issues: [
          {
            lineIndex: null,
            field: null,
            code: 'too_many_lines',
            message: 'Too many lines',
            severity: 'error',
          },
          {
            lineIndex: 0,
            field: 'user.email',
            code: 'email_domain',
            message: 'Email is not on the account’s domain',
            severity: 'warning',
          },
          {
            lineIndex: 1,
            field: 'before',
            code: 'user_locked',
            message: 'Another order is changing Ada Lovelace',
            severity: 'error',
          },
        ],
      }),
    );
    expect(textsOf(host, '.order-issues li')).toEqual(['error: Too many lines']);
    expect(textsOf(rowOf(host, 0), '.issues-row li')).toEqual([
      'warning: Email is not on the account’s domain',
    ]);
    expect(rowOf(host, 1).dataset['severity']).toBe('error');
    expect(host.querySelector('.verdict')?.textContent).toContain('2 errors to fix');

    const submit = host.querySelector<HTMLButtonElement>('button.submit')!;
    expect(submit.disabled).toBe(true);
    // The verdict says why: one message, not a second one by the button.
    expect(submit.getAttribute('aria-describedby')).toBe('review-verdict');
    expect(host.querySelector('#review-verdict')?.textContent).toContain('2 errors to fix');
  });

  it('lets warnings through and reports the buttons', async () => {
    const { fixture, host } = await render(
      aPreview({
        issues: [
          {
            lineIndex: 0,
            field: 'user.macAddress',
            code: 'mac_missing',
            message: 'No MAC yet',
            severity: 'warning',
          },
        ],
      }),
    );
    const submitted = vi.fn();
    const back = vi.fn();
    fixture.componentInstance.submitOrder.subscribe(submitted);
    fixture.componentInstance.back.subscribe(back);

    const submit = host.querySelector<HTMLButtonElement>('button.submit')!;
    expect(submit.disabled).toBe(false);
    submit.click();
    host.querySelector<HTMLButtonElement>('.footer button')!.click();
    expect(submitted).toHaveBeenCalledOnce();
    expect(back).toHaveBeenCalledOnce();
  });

  it('shows the submit in progress and why it failed', async () => {
    const busy = await render(aPreview(), { submitting: true });
    const button = busy.host.querySelector<HTMLButtonElement>('button.submit')!;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Submitting');

    TestBed.resetTestingModule();
    const failed = await render(aPreview(), { submitError: new Error('boom') });
    expect(failed.host.querySelector('[role="alert"].submit-error')?.textContent).toContain(
      'Something went wrong',
    );
  });

  it('stacks the lines as cards on phones', async () => {
    const { host } = await render(aPreview(), { handset: true });
    expect(host.querySelector('table')).toBeNull();
    const cards = host.querySelectorAll<HTMLElement>('.cards > li');
    expect([...cards].map((card) => card.dataset['action'])).toEqual([
      'add_user',
      'update_user',
      'remove_user',
    ]);
    expect(cards[1]?.textContent).toContain('Voicemail');
  });
});
