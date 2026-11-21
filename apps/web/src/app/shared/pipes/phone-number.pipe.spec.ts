import { PhoneNumberPipe, formatPhoneNumber } from './phone-number.pipe';

describe('formatPhoneNumber', () => {
  it('formats North American E.164 numbers', () => {
    expect(formatPhoneNumber('+16135550142')).toBe('(613) 555-0142');
  });

  it('leaves other numbers as given', () => {
    expect(formatPhoneNumber('+442079460000')).toBe('+442079460000');
    expect(formatPhoneNumber('6135550142')).toBe('6135550142');
  });

  it('returns an empty string for missing values', () => {
    expect(formatPhoneNumber(null)).toBe('');
    expect(formatPhoneNumber(undefined)).toBe('');
    expect(formatPhoneNumber('')).toBe('');
  });

  it('is exposed as the phoneNumber pipe', () => {
    expect(new PhoneNumberPipe().transform('+16135550101')).toBe('(613) 555-0101');
  });
});
