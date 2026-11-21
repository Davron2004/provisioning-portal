import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { StatusFilter } from './status-filter';

@Component({
  imports: [StatusFilter],
  template: `<app-status-filter
    label="Status"
    [statuses]="['active', 'failed']"
    [value]="value()"
    (valueChange)="changes.push($event); value.set($event)"
  />`,
})
class Host {
  readonly value = signal<string | null>(null);
  readonly changes: (string | null)[] = [];
}

describe('StatusFilter', () => {
  const setup = async (value: string | null) => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.value.set(value);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const chips = () => [...host.querySelectorAll<HTMLElement>('mat-chip-option')];
    const select = async (label: string) => {
      chips()
        .find((chip) => chip.textContent?.trim() === label)!
        .querySelector<HTMLElement>('.mdc-evolution-chip__action')!
        .click();
      await fixture.whenStable();
    };
    return { host, chips, select, changes: fixture.componentInstance.changes };
  };

  it('offers All and every status by its label, named for assistive tech', async () => {
    const { host, chips } = await setup(null);
    expect(chips().map((chip) => chip.textContent?.trim())).toEqual(['All', 'Active', 'Failed']);
    expect(host.querySelector('mat-chip-listbox')?.getAttribute('aria-label')).toBe('Status');
  });

  it('marks the current status, and All when there is none', async () => {
    const all = await setup(null);
    expect(all.host.querySelector('.mat-mdc-chip-selected')?.textContent?.trim()).toBe('All');
    const failed = await setup('failed');
    expect(failed.host.querySelector('.mat-mdc-chip-selected')?.textContent?.trim()).toBe('Failed');
  });

  it('emits the chosen status, and null for All', async () => {
    const { select, changes } = await setup(null);
    await select('Failed');
    await select('All');
    expect(changes).toEqual(['failed', null]);
  });
});
