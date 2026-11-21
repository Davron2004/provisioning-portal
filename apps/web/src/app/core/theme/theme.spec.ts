import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { THEME_COLORS, THEME_STORAGE_KEY, ThemeService } from './theme';

describe('ThemeService', () => {
  let root: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    root = TestBed.inject(DOCUMENT).documentElement;
    root.removeAttribute('data-theme');
  });

  afterEach(() => localStorage.clear());

  it('follows the system by default and sets no data-theme', () => {
    const theme = TestBed.inject(ThemeService);
    TestBed.tick();

    expect(theme.mode()).toBe('system');
    expect(root.hasAttribute('data-theme')).toBe(false);
  });

  it('applies and stores an explicit choice', () => {
    const theme = TestBed.inject(ThemeService);
    theme.setMode('dark');
    TestBed.tick();

    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(theme.resolved()).toBe('dark');
  });

  it('forgets the stored choice when switching back to system', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const theme = TestBed.inject(ThemeService);
    expect(theme.mode()).toBe('light');

    theme.setMode('system');
    TestBed.tick();

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(root.hasAttribute('data-theme')).toBe(false);
  });

  it('keeps the browser toolbar color in step with the chosen theme', () => {
    const document = TestBed.inject(DOCUMENT);
    const meta = (scheme: string) => {
      const element = document.createElement('meta');
      element.name = 'theme-color';
      element.media = `(prefers-color-scheme: ${scheme})`;
      element.content = THEME_COLORS[scheme as 'light' | 'dark'];
      document.head.append(element);
      return element;
    };
    const light = meta('light');
    const dark = meta('dark');
    const theme = TestBed.inject(ThemeService);

    theme.setMode('dark');
    TestBed.tick();
    expect([light.content, dark.content]).toEqual([THEME_COLORS.dark, THEME_COLORS.dark]);

    theme.setMode('system');
    TestBed.tick();
    expect([light.content, dark.content]).toEqual([THEME_COLORS.light, THEME_COLORS.dark]);
    light.remove();
    dark.remove();
  });

  it('ignores an unknown stored value', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    expect(TestBed.inject(ThemeService).mode()).toBe('system');
  });
});
