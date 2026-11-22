import { TestBed } from '@angular/core/testing';
import { FakeRealtime, provideFakeRealtime } from '../../../testing/realtime-fake';
import { ConnectionStatus } from './connection-status';

describe('ConnectionStatus', () => {
  const setUp = async () => {
    const realtime = new FakeRealtime();
    TestBed.configureTestingModule({ providers: [provideFakeRealtime(realtime)] });
    const fixture = TestBed.createComponent(ConnectionStatus);
    await fixture.whenStable();
    return { fixture, realtime, host: fixture.nativeElement as HTMLElement };
  };

  it('names the connection state', async () => {
    const { fixture, realtime, host } = await setUp();
    const label = () => host.querySelector('.pill:not(.sizer) .label')?.textContent;
    expect(host.getAttribute('role')).toBe('status');
    expect(label()).toBe('Live');

    realtime.state.set('reconnecting');
    await fixture.whenStable();
    expect(label()).toBe('Reconnecting');
    expect(host.dataset['state']).toBe('reconnecting');
  });

  it('reserves the width of its longest label, out of sight and unannounced', async () => {
    const { host } = await setUp();
    const sizer = host.querySelector('.sizer')!;
    expect(sizer.getAttribute('aria-hidden')).toBe('true');
    expect(sizer.textContent?.trim()).toBe('Reconnecting');
  });
});
