import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AppIcon } from '../../core/icons/icons';
import { ThemeMode, ThemeService } from '../../core/theme/theme';

interface ThemeOption {
  readonly mode: ThemeMode;
  readonly label: string;
  readonly icon: AppIcon;
}

const OPTIONS: readonly ThemeOption[] = [
  { mode: 'light', label: 'Light', icon: 'light_mode' },
  { mode: 'dark', label: 'Dark', icon: 'dark_mode' },
  { mode: 'system', label: 'System', icon: 'contrast' },
];

@Component({
  selector: 'app-theme-toggle',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      matIconButton
      type="button"
      [matMenuTriggerFor]="menu"
      [attr.aria-label]="'Theme: ' + current().label"
      matTooltip="Theme"
    >
      <mat-icon [svgIcon]="current().icon" />
    </button>
    <mat-menu #menu="matMenu" xPosition="before">
      @for (option of options; track option.mode) {
        <button
          mat-menu-item
          type="button"
          role="menuitemradio"
          [attr.aria-checked]="option.mode === theme.mode()"
          (click)="theme.setMode(option.mode)"
        >
          <mat-icon [svgIcon]="option.icon" />
          <span class="option">
            {{ option.label }}
            @if (option.mode === theme.mode()) {
              <mat-icon class="check" svgIcon="check" aria-hidden="true" />
            }
          </span>
        </button>
      }
    </mat-menu>
  `,
  styles: `
    .option {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--app-space-6);
      min-width: 96px;
    }
    .check {
      width: 20px;
      height: 20px;
      color: var(--mat-sys-primary);
    }
  `,
})
export class ThemeToggle {
  protected readonly theme = inject(ThemeService);
  protected readonly options = OPTIONS;
  protected readonly current = computed(
    () => OPTIONS.find((option) => option.mode === this.theme.mode()) ?? OPTIONS[2]!,
  );
}
