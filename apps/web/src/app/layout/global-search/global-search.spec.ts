import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideAppIcons } from '../../core/icons/icons';
import { GlobalSearch } from './global-search';

@Component({ template: '' })
class Blank {}

describe('GlobalSearch', () => {
  it('shows the current search on the search page and clears elsewhere', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'search', component: Blank },
          { path: 'overview', component: Blank },
        ]),
        provideAppIcons(),
      ],
    });
    const fixture = TestBed.createComponent(GlobalSearch);
    const router = TestBed.inject(Router);
    const input = () => (fixture.nativeElement as HTMLElement).querySelector('input')!;

    await router.navigateByUrl('/search?q=campbell');
    await fixture.whenStable();
    expect(input().value).toBe('campbell');

    await router.navigateByUrl('/overview');
    await fixture.whenStable();
    expect(input().value).toBe('');
  });

  it('opens the search page for what was typed', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'search', component: Blank }]), provideAppIcons()],
    });
    const fixture = TestBed.createComponent(GlobalSearch);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector('input')!;
    input.value = ' 555-0142 ';
    input.dispatchEvent(new Event('input'));
    host.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/search?q=555-0142');
  });
});
