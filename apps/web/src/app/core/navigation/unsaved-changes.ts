import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { CanDeactivateFn } from '@angular/router';
import { map } from 'rxjs';
import { ConfirmDialog, ConfirmDialogData } from '../../shared/ui/confirm-dialog/confirm-dialog';

/** What to ask before leaving work that is not saved. */
export interface UnsavedChangesPrompt {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
}

/** A page that can hold work the person has not submitted yet. */
export interface GuardsUnsavedChanges {
  /** The question to ask before leaving, or null when there is nothing to lose. */
  unsavedChanges(): UnsavedChangesPrompt | null;
}

/**
 * `canDeactivate: [unsavedChangesGuard]`: leaving a page with unsaved work asks first,
 * in a Material dialog ("Keep editing" is the default). Pair it with
 * `confirmBeforeUnload()` in the page, for reloads and closed tabs.
 */
export const unsavedChangesGuard: CanDeactivateFn<GuardsUnsavedChanges> = (page) => {
  const prompt = page.unsavedChanges();
  if (!prompt) {
    return true;
  }
  const data: ConfirmDialogData = { ...prompt, cancelLabel: 'Keep editing' };
  return inject(MatDialog)
    .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
      data,
      width: '440px',
      maxWidth: 'calc(100vw - 32px)',
      role: 'alertdialog',
    })
    .afterClosed()
    .pipe(map((confirmed) => confirmed === true));
};

/**
 * While `hasUnsavedChanges()` is true, reloading or closing the tab asks the browser's own
 * "Leave site?" question (browsers do not allow a custom dialog there). Call it in an
 * injection context; the listener goes away with the caller.
 */
export function confirmBeforeUnload(hasUnsavedChanges: () => boolean): void {
  const window = inject(DOCUMENT).defaultView;
  if (!window) {
    return;
  }
  const listener = (event: BeforeUnloadEvent) => {
    if (hasUnsavedChanges()) {
      event.preventDefault();
    }
  };
  window.addEventListener('beforeunload', listener);
  inject(DestroyRef).onDestroy(() => window.removeEventListener('beforeunload', listener));
}
