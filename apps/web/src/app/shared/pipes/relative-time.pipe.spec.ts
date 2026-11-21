import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Clock } from '../time/clock';
import { RelativeTimePipe } from './relative-time.pipe';

describe('RelativeTimePipe', () => {
  it('re-evaluates against the shared clock', () => {
    const now = signal(Date.parse('2026-11-21T15:00:00Z'));
    TestBed.configureTestingModule({
      providers: [RelativeTimePipe, { provide: Clock, useValue: { now } }],
    });
    const pipe = TestBed.inject(RelativeTimePipe);

    expect(pipe.transform('2026-11-21T14:57:00Z')).toBe('3 min ago');
    now.set(Date.parse('2026-11-21T15:10:00Z'));
    expect(pipe.transform('2026-11-21T14:57:00Z')).toBe('13 min ago');
    expect(pipe.transform(null)).toBe('');
  });
});
