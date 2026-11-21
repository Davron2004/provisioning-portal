import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface ConfirmDialogData {
  readonly title: string;
  readonly message: string;
  /** The action that goes ahead, e.g. "Discard order". */
  readonly confirmLabel: string;
  /** The safe way out, focused first, e.g. "Keep editing". */
  readonly cancelLabel: string;
}

/**
 * A yes/no question in a Material dialog; closes with `true` only when confirmed.
 * Open it with `MatDialog.open(ConfirmDialog, { data })`. Focus starts on the safe choice.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [MatButtonModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>{{ data.message }}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" [mat-dialog-close]="false" cdkFocusInitial>
        {{ data.cancelLabel }}
      </button>
      <button matButton="filled" type="button" [mat-dialog-close]="true">
        {{ data.confirmLabel }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}
