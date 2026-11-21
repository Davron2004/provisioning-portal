import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** Shared with public/theme-init.js, which applies the stored choice before first paint. */
export const THEME_STORAGE_KEY = 'pp.theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Light, dark, or follow the OS. The choice lives in localStorage and on
 * <html data-theme>, which flips the CSS `color-scheme` that every token reads.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private readonly media = this.window?.matchMedia?.(DARK_QUERY);
  private readonly systemPrefersDark = signal(this.media?.matches ?? false);

  readonly mode = signal<ThemeMode>(this.readStoredMode());
  readonly resolved = computed<ResolvedTheme>(() => {
    const mode = this.mode();
    if (mode !== 'system') {
      return mode;
    }
    return this.systemPrefersDark() ? 'dark' : 'light';
  });

  constructor() {
    this.media?.addEventListener('change', (event) => this.systemPrefersDark.set(event.matches));

    effect(() => {
      const mode = this.mode();
      const root = this.document.documentElement;
      if (mode === 'system') {
        root.removeAttribute('data-theme');
      } else {
        root.setAttribute('data-theme', mode);
      }
      this.store(mode);
    });
  }

  setMode(mode: ThemeMode): void {
    this.mode.set(mode);
  }

  private readStoredMode(): ThemeMode {
    try {
      const stored = this.window?.localStorage.getItem(THEME_STORAGE_KEY);
      return stored === 'light' || stored === 'dark' ? stored : 'system';
    } catch {
      return 'system';
    }
  }

  private store(mode: ThemeMode): void {
    try {
      if (mode === 'system') {
        this.window?.localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        this.window?.localStorage.setItem(THEME_STORAGE_KEY, mode);
      }
    } catch {
      // Storage unavailable: the choice still applies for this visit.
    }
  }
}
