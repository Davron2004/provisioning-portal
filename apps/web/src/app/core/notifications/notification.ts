import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { toApiProblem } from '../api/api-problem';

/** Short, non-blocking messages at the bottom of the screen. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly snackBar = inject(MatSnackBar);

  /** Confirms something the person did ("Order submitted"). */
  success(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 4000, politeness: 'polite' });
  }

  info(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 5000, politeness: 'polite' });
  }

  /**
   * Reports a failure. Pass a string, or the raw error from HttpClient/httpResource
   * and the message is taken from the ApiError body (see toApiProblem).
   */
  error(error: unknown): void {
    const message = typeof error === 'string' ? error : toApiProblem(error).message;
    this.snackBar.open(message, 'Dismiss', {
      duration: 8000,
      politeness: 'assertive',
      panelClass: 'app-snackbar-error',
    });
  }
}
