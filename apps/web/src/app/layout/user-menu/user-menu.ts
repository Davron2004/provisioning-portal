import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/auth/auth';

@Component({
  selector: 'app-user-menu',
  imports: [MatButtonModule, MatDividerModule, MatIconModule, MatMenuModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (auth.user(); as user) {
      <button
        class="trigger"
        type="button"
        [matMenuTriggerFor]="menu"
        [attr.aria-label]="'Account: ' + user.name"
        [matTooltip]="user.name"
      >
        <span class="avatar" aria-hidden="true">{{ initials() }}</span>
      </button>
      <mat-menu #menu="matMenu" xPosition="before" class="app-user-menu">
        <div class="identity">
          <span class="avatar avatar--large" aria-hidden="true">{{ initials() }}</span>
          <span class="who">
            <span class="name">{{ user.name }}</span>
            <span class="email">{{ user.email }}</span>
          </span>
        </div>
        <mat-divider />
        <button mat-menu-item type="button" (click)="auth.signOut()">
          <mat-icon svgIcon="logout" />
          Sign out
        </button>
      </mat-menu>
    }
  `,
  styleUrl: './user-menu.scss',
})
export class UserMenu {
  protected readonly auth = inject(AuthService);

  protected readonly initials = computed(() => {
    const user = this.auth.user();
    if (!user) {
      return '';
    }
    const words = user.name.trim().split(/\s+/).filter(Boolean);
    const letters =
      words.length >= 2
        ? `${words[0]![0]}${words.at(-1)![0]}`
        : (words[0] ?? user.email).slice(0, 2);
    return letters.toUpperCase();
  });
}
