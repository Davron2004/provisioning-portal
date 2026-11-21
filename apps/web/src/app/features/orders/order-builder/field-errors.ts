import { Signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, ControlEvent } from '@angular/forms';
import { startWith, switchMap } from 'rxjs';

/**
 * The one message to show under a field: the first error it has, in words.
 * `label` names the field for generic errors ("First name is required").
 */
export function fieldError(control: AbstractControl, label: string): string {
  const errors = control.errors;
  if (!errors) {
    return '';
  }
  if (typeof errors['server'] === 'string') {
    return errors['server'];
  }
  if (errors['required']) {
    return `${label} is required`;
  }
  if (errors['maxlength']) {
    return `${label} can be at most ${errors['maxlength'].requiredLength} characters`;
  }
  if (errors['email']) {
    return 'Enter an email address like name@example.com';
  }
  if (errors['emailTaken']) {
    return `Already used by ${errors['emailTaken'].owner}`;
  }
  if (errors['extensionFormat']) {
    return 'Use 3 to 6 digits';
  }
  if (errors['extensionRange']) {
    const { site, start, end } = errors['extensionRange'];
    return `${site} uses ${start}–${end}`;
  }
  if (errors['extensionTaken']) {
    return `Already ${errors['extensionTaken'].owner}’s extension`;
  }
  if (errors['macAddress']) {
    return 'Use 12 hex digits, like 00:1A:2B:3C:4D:5E';
  }
  if (errors['userNotPicked']) {
    return 'Choose a user from the list';
  }
  return `Check the ${label.toLowerCase()}`;
}

/**
 * A signal that ticks whenever the control, or anything inside it, changes value,
 * validity, or touched state. Reading it in a computed or an OnPush template keeps
 * them in step with a form, which is not made of signals. Injection context only.
 */
export function watchControl(control: Signal<AbstractControl>): Signal<ControlEvent | null> {
  return toSignal(toObservable(control).pipe(switchMap((c) => c.events.pipe(startWith(null)))), {
    initialValue: null,
  });
}
