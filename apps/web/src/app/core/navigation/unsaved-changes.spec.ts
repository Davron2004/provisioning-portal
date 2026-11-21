import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  GuardsUnsavedChanges,
  UnsavedChangesPrompt,
  confirmBeforeUnload,
  unsavedChangesGuard,
} from './unsaved-changes';

const PROMPT: UnsavedChangesPrompt = {
  title: 'Discard this order?',
  message: 'Nothing has been submitted.',
  confirmLabel: 'Discard order',
};

@Component({ template: 'editor' })
class Editor implements GuardsUnsavedChanges {
  readonly dirty = signal(false);
  constructor() {
    confirmBeforeUnload(() => this.dirty());
  }
  unsavedChanges() {
    return this.dirty() ? PROMPT : null;
  }
}

@Component({ template: 'elsewhere' })
class Elsewhere {}

describe('unsavedChangesGuard', () => {
  const setUp = async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'edit', component: Editor, canDeactivate: [unsavedChangesGuard] },
          { path: 'elsewhere', component: Elsewhere },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    const editor = await harness.navigateByUrl('/edit', Editor);
    const leave = () => harness.navigateByUrl('/elsewhere');
    const dialog = () => document.querySelector<HTMLElement>('mat-dialog-container');
    // The navigation is pending while the dialog is open, so the app is not stable:
    // wait for the dialog itself.
    const dialogOpened = async () => {
      for (let i = 0; i < 50 && !dialog(); i++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        harness.fixture.detectChanges();
      }
      return dialog();
    };
    const answer = (label: string) =>
      [...dialog()!.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent?.trim() === label)!
        .click();
    return { harness, editor, leave, dialog, dialogOpened, answer };
  };

  afterEach(() => document.querySelector('.cdk-overlay-container')?.remove());

  it('lets the page go when nothing is unsaved', async () => {
    const { harness, leave, dialog } = await setUp();
    await leave();
    expect(harness.routeNativeElement?.textContent).toBe('elsewhere');
    expect(dialog()).toBeNull();
  });

  it('asks in a dialog first, and stays when the person keeps editing', async () => {
    const { harness, editor, leave, dialogOpened, answer } = await setUp();
    editor.dirty.set(true);
    const leaving = leave();
    const dialog = await dialogOpened();

    expect(dialog?.getAttribute('role')).toBe('alertdialog');
    expect(dialog?.textContent).toContain('Discard this order?');
    expect(dialog?.textContent).toContain('Nothing has been submitted.');
    answer('Keep editing');
    await leaving;
    expect(harness.routeNativeElement?.textContent).toBe('editor');
  });

  it('leaves when the person confirms', async () => {
    const { harness, editor, leave, dialogOpened, answer } = await setUp();
    editor.dirty.set(true);
    const leaving = leave();
    await dialogOpened();
    answer('Discard order');
    await leaving;
    expect(harness.routeNativeElement?.textContent).toBe('elsewhere');
  });

  it('asks the browser before a reload or closed tab, only while unsaved', async () => {
    const { editor } = await setUp();
    const unload = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(unload()).toBe(false);
    editor.dirty.set(true);
    expect(unload()).toBe(true);
  });
});
