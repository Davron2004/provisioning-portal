import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Site, VoiceUser } from '@provisioning/contracts';
import { filterUsers } from '../../accounts/account-detail/users-tab/user-filter';
import { UserChoice } from '../order-form/order-form';
import { fieldError, watchControl } from './field-errors';

/** How many matches the list shows; typing more narrows it. */
const MAX_OPTIONS = 8;

/**
 * Finds an existing user by name, email, extension or number as you type. The
 * control holds the picked VoiceUser, or the typed text until one is picked.
 */
@Component({
  selector: 'app-user-picker',
  imports: [
    MatAutocompleteModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-form-field class="field">
      <mat-label>{{ label() }}</mat-label>
      <mat-icon matPrefix svgIcon="search" aria-hidden="true" />
      <input
        matInput
        data-autofocus
        autocomplete="off"
        placeholder="Name, email, extension or number"
        [formControl]="control()"
        [matAutocomplete]="auto"
      />
      <mat-autocomplete
        #auto="matAutocomplete"
        autoActiveFirstOption
        [displayWith]="displayUser"
        class="app-user-picker-panel"
      >
        @for (user of options(); track user.id) {
          <mat-option [value]="user" [disabled]="excluded().has(user.id)">
            <span class="option-name">{{ user.firstName }} {{ user.lastName }}</span>
            <span class="option-meta app-numeric">
              Ext {{ user.extension }} · {{ siteName(user.siteId) }}
              @if (excluded().has(user.id)) {
                · already in this order
              }
            </span>
          </mat-option>
        } @empty {
          @if (query()) {
            <mat-option disabled>No users match “{{ query() }}”</mat-option>
          }
        }
      </mat-autocomplete>
      @if (control().invalid) {
        <mat-error>{{ error() }}</mat-error>
      }
    </mat-form-field>
  `,
  styles: `
    :host {
      display: block;
    }
    .field {
      width: 100%;
    }
    .option-name {
      display: block;
    }
    .option-meta {
      display: block;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class UserPicker {
  readonly control = input.required<FormControl<UserChoice>>();
  readonly users = input.required<readonly VoiceUser[]>();
  readonly sites = input<readonly Site[]>([]);
  /** Users already changed or removed by another line; shown, but not selectable. */
  readonly excluded = input<ReadonlySet<string>>(new Set());
  readonly label = input('User');

  /** Re-reads the control on every change: it is not a signal itself. */
  private readonly value = watchControl(this.control);

  protected readonly query = computed(() => {
    this.value();
    const value = this.control().value;
    return typeof value === 'string' ? value.trim() : '';
  });
  protected readonly options = computed(() =>
    filterUsers(this.users(), this.query()).slice(0, MAX_OPTIONS),
  );
  protected readonly error = computed(() => {
    this.value();
    return fieldError(this.control(), this.label());
  });

  protected readonly displayUser = (choice: UserChoice): string =>
    choice && typeof choice === 'object'
      ? `${choice.firstName} ${choice.lastName}`
      : (choice ?? '');

  protected siteName(siteId: string): string {
    return this.sites().find((site) => site.id === siteId)?.name ?? '';
  }
}
