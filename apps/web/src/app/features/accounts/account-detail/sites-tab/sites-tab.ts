import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Site } from '@provisioning/contracts';
import { Clock } from '../../../../shared/time/clock';
import { EmptyState } from '../../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../../shared/ui/error-state/error-state';
import { Skeleton } from '../../../../shared/ui/skeleton/skeleton';
import { AccountStore } from '../account-store';

/** "2:05 PM" in the site's time zone, so it is clear when people there are at work. */
export function localTime(timezone: string, now: number): string {
  try {
    return new Intl.DateTimeFormat('en', { timeZone: timezone, timeStyle: 'short' }).format(now);
  } catch {
    return '';
  }
}

@Component({
  selector: 'app-sites-tab',
  imports: [EmptyState, ErrorState, MatButtonModule, MatIconModule, RouterLink, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.sitesResource.error(); as error) {
      <app-error-state
        heading="Could not load sites"
        [error]="error"
        (retry)="store.sitesResource.reload()"
      />
    } @else if (store.sites(); as sites) {
      @if (sites.length === 0) {
        <app-empty-state
          icon="location_on"
          heading="No sites yet"
          message="Sites are the offices where this account's users and numbers live."
        />
      } @else {
        <ul class="grid" aria-label="Sites">
          @for (site of sites; track site.id) {
            <li class="site">
              <h2 class="name">{{ site.name }}</h2>
              <address class="address">
                {{ site.address.line1 }}<br />
                {{ site.address.city }}, {{ site.address.region }} {{ site.address.postalCode }}
              </address>
              <p class="zone">
                <mat-icon svgIcon="schedule" aria-hidden="true" />
                <span class="app-numeric">{{ time(site) }}</span>
                <span class="app-muted">{{ site.timezone }}</span>
              </p>
              <dl class="facts">
                <div>
                  <dt>Users</dt>
                  <dd class="app-numeric">{{ site.userCount }}</dd>
                </div>
                <div>
                  <dt>Numbers free</dt>
                  <dd class="app-numeric">{{ site.numbersAvailable }}</dd>
                </div>
                <div>
                  <dt>Extensions</dt>
                  <dd class="app-numeric">
                    {{ site.extensionRange.start }}–{{ site.extensionRange.end }}
                  </dd>
                </div>
              </dl>
              <div class="links">
                <a
                  matButton
                  routerLink="../users"
                  [queryParams]="{ site: site.id }"
                  [attr.aria-label]="'Users at ' + site.name"
                  >View users</a
                >
                <a
                  matButton
                  routerLink="../numbers"
                  [queryParams]="{ site: site.id }"
                  [attr.aria-label]="'Numbers at ' + site.name"
                  >View numbers</a
                >
              </div>
            </li>
          }
        </ul>
      }
    } @else {
      <ul class="grid" aria-label="Loading sites" aria-busy="true">
        @for (placeholder of [1, 2, 3]; track placeholder) {
          <li class="site">
            <app-skeleton width="50%" height="22px" />
            <app-skeleton [lines]="2" />
            <app-skeleton width="70%" />
            <app-skeleton height="44px" />
          </li>
        }
      </ul>
    }
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: var(--app-space-4);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .site {
      display: flex;
      flex-direction: column;
      gap: var(--app-space-3);
      padding: var(--app-space-5) var(--app-space-5) var(--app-space-3);
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--app-radius-lg);
      background: var(--mat-sys-surface-container-lowest);
    }
    .name {
      font: var(--mat-sys-title-medium);
      font-weight: 600;
    }
    .address {
      font: var(--mat-sys-body-medium);
      font-style: normal;
      color: var(--mat-sys-on-surface-variant);
    }
    .zone {
      display: flex;
      align-items: center;
      gap: var(--app-space-2);
      font: var(--mat-sys-body-small);
      mat-icon {
        width: 18px;
        height: 18px;
        color: var(--mat-sys-on-surface-variant);
      }
    }
    .facts {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--app-space-3);
      margin: 0;
      padding-top: var(--app-space-3);
      border-top: 1px solid var(--mat-sys-outline-variant);
      dt {
        font: var(--mat-sys-label-small);
        color: var(--mat-sys-on-surface-variant);
      }
      dd {
        margin: 2px 0 0;
        font: var(--mat-sys-title-small);
        font-weight: 600;
      }
    }
    .links {
      display: flex;
      gap: var(--app-space-1);
      margin: 0 calc(-1 * var(--app-space-3));
    }
  `,
})
export class SitesTab {
  protected readonly store = inject(AccountStore);
  private readonly clock = inject(Clock);

  protected time(site: Site): string {
    return localTime(site.timezone, this.clock.now());
  }
}
