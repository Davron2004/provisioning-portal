import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatTooltip } from '@angular/material/tooltip';
import { By } from '@angular/platform-browser';
import { Truncate } from './truncate';

@Component({
  imports: [Truncate],
  template: `<span appTruncate>{{ text }}</span>`,
})
class Host {
  text = 'gabriel.anderson@lumenridge.example.com';
}

describe('Truncate', () => {
  const setup = async (sizes: { scrollWidth: number; clientWidth: number }) => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const debug = fixture.debugElement.query(By.directive(Truncate));
    const element = debug.nativeElement as HTMLElement;
    Object.defineProperty(element, 'scrollWidth', { value: sizes.scrollWidth });
    Object.defineProperty(element, 'clientWidth', { value: sizes.clientWidth });
    return { element, tooltip: debug.injector.get(MatTooltip) };
  };

  it('cuts the text to one line', async () => {
    const { element } = await setup({ scrollWidth: 100, clientWidth: 100 });
    expect(element.classList).toContain('app-truncate');
  });

  it('shows the full text in a tooltip when it is cut off', async () => {
    const { element, tooltip } = await setup({ scrollWidth: 320, clientWidth: 180 });
    element.dispatchEvent(new MouseEvent('mouseenter'));
    expect(tooltip.disabled).toBe(false);
    expect(tooltip.message).toBe('gabriel.anderson@lumenridge.example.com');
  });

  it('has no tooltip when the text fits', async () => {
    const { element, tooltip } = await setup({ scrollWidth: 180, clientWidth: 180 });
    element.dispatchEvent(new MouseEvent('mouseenter'));
    expect(tooltip.disabled).toBe(true);
    expect(tooltip.message).toBe('');
  });
});
