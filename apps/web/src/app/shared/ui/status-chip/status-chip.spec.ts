import { TestBed } from '@angular/core/testing';
import { provideAppIcons } from '../../../core/icons/icons';
import { AnyStatus, STATUS_STYLES } from './status';
import { StatusChip } from './status-chip';

describe('StatusChip', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppIcons()] });
  });

  const render = async (status: AnyStatus, label?: string) => {
    const fixture = TestBed.createComponent(StatusChip);
    fixture.componentRef.setInput('status', status);
    if (label) {
      fixture.componentRef.setInput('label', label);
    }
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  it.each<[AnyStatus, string, string]>([
    ['active', 'success', 'Active'],
    ['provisioning', 'info', 'Provisioning'],
    ['failed', 'error', 'Failed'],
    ['reserved', 'warning', 'Reserved'],
    ['pending', 'neutral', 'Pending'],
  ])('shows %s as %s tone with text', async (status, tone, text) => {
    const host = await render(status);
    expect(host.dataset['tone']).toBe(tone);
    expect(host.textContent?.trim()).toBe(text);
  });

  it('pairs every status with an icon, so color is never the only cue', async () => {
    const host = await render('failed');
    const icon = host.querySelector('mat-icon');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.querySelector('svg')).not.toBeNull();
  });

  it('spins the icon only while work is under way', async () => {
    expect((await render('validating')).classList).toContain('app-status-chip--busy');
    expect((await render('active')).classList).not.toContain('app-status-chip--busy');
  });

  it('accepts a custom label', async () => {
    expect((await render('failed', '2 failed')).textContent?.trim()).toBe('2 failed');
  });

  it('has a style for every status in the contract', () => {
    for (const style of Object.values(STATUS_STYLES)) {
      expect(style.label).toBeTruthy();
      expect(style.icon).toBeTruthy();
    }
  });
});
