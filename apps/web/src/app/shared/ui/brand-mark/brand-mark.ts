import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** The product mark: one source fanning out to three lines. Decorative. */
@Component({
  selector: 'app-brand-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[style.--size]': 'size()' },
  template: `
    <svg viewBox="0 0 32 32" focusable="false">
      <rect width="32" height="32" rx="8" class="tile" />
      <path
        class="lines"
        d="M11 16h3.5M14.5 16 21 9.5M14.5 16H21M14.5 16 21 22.5"
        fill="none"
        stroke-width="2.25"
        stroke-linecap="round"
      />
      <g class="nodes">
        <circle cx="9.5" cy="16" r="3" />
        <circle cx="22.5" cy="9.5" r="2.25" />
        <circle cx="22.5" cy="16" r="2.25" />
        <circle cx="22.5" cy="22.5" r="2.25" />
      </g>
    </svg>
  `,
  styles: `
    :host {
      display: inline-block;
      width: var(--size);
      height: var(--size);
      flex: none;
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
    }
    .tile {
      fill: var(--mat-sys-primary);
    }
    .lines {
      stroke: var(--mat-sys-on-primary);
    }
    .nodes {
      fill: var(--mat-sys-on-primary);
    }
  `,
})
export class BrandMark {
  readonly size = input('32px');
}
