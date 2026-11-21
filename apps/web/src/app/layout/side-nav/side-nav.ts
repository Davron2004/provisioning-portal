import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatRippleModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AppConfig } from '../../core/config/app-config';
import { AppIcon } from '../../core/icons/icons';

interface NavItem {
  readonly label: string;
  readonly path: string;
  readonly icon: AppIcon;
  readonly activeIcon: AppIcon;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Overview', path: '/overview', icon: 'dashboard', activeIcon: 'dashboard-fill' },
  { label: 'Accounts', path: '/accounts', icon: 'domain', activeIcon: 'domain-fill' },
  { label: 'Orders', path: '/orders', icon: 'receipt_long', activeIcon: 'receipt_long-fill' },
  { label: 'Assistant', path: '/assistant', icon: 'wand_stars', activeIcon: 'wand_stars-fill' },
  { label: 'Search', path: '/search', icon: 'search', activeIcon: 'search' },
];

@Component({
  selector: 'app-side-nav',
  imports: [MatIconModule, MatRippleModule, MatTooltipModule, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.collapsed]': 'collapsed()' },
  template: `
    <nav aria-label="Main">
      <ul>
        @for (item of items; track item.path) {
          <li>
            <a
              class="link"
              matRipple
              [routerLink]="item.path"
              routerLinkActive="active"
              ariaCurrentWhenActive="page"
              #rla="routerLinkActive"
              [matTooltip]="item.label"
              [matTooltipDisabled]="!collapsed()"
              matTooltipPosition="right"
            >
              <mat-icon [svgIcon]="rla.isActive ? item.activeIcon : item.icon" aria-hidden="true" />
              <span class="label">{{ item.label }}</span>
            </a>
          </li>
        }
      </ul>
    </nav>
    <div class="environment" [matTooltip]="environmentLabel" [matTooltipDisabled]="!collapsed()">
      <span class="env-dot" aria-hidden="true"></span>
      <span class="label">{{ environmentLabel }}</span>
    </div>
  `,
  styleUrl: './side-nav.scss',
})
export class SideNav {
  /** Icon-only rail (desktop). Labels stay in the DOM for screen readers. */
  readonly collapsed = input(false);
  protected readonly items = NAV_ITEMS;
  protected readonly environmentLabel =
    inject(AppConfig).value.environment === 'local' ? 'Local environment' : 'AWS environment';
}
