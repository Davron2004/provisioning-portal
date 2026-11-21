import { Pipe, PipeTransform } from '@angular/core';

const NANP = /^\+1(\d{3})(\d{3})(\d{4})$/;

/** North American E.164 for people: +16135550142 -> (613) 555-0142. */
export function formatPhoneNumber(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const match = NANP.exec(value);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : value;
}

/**
 * `{{ user.did | phoneNumber }}`. Numbers outside North America are shown as given.
 * Pair with the `app-numeric` class so digits line up in tables.
 */
@Pipe({ name: 'phoneNumber' })
export class PhoneNumberPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return formatPhoneNumber(value);
  }
}
