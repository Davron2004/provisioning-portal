import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MAX_ORDER_LINES } from '@provisioning/contracts';
import { AccountDirectory } from '../account-directory';
import { OrderForm, OrderLine, isAddLine, pickedUser } from '../order-form/order-form';
import { watchControl } from './field-errors';
import { OrderLineEditor } from './order-line-editor';

/**
 * Edits the lines of an OrderForm: one card per line, buttons to add each kind of
 * line, and duplicate/remove on every card. Focus follows the change, so it can be
 * driven from the keyboard alone: a new line focuses its first field, and removing
 * a line moves focus to the next one (or to the add buttons).
 */
@Component({
  selector: 'app-order-builder',
  imports: [MatButtonModule, MatIconModule, OrderLineEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="lines" aria-label="Order lines">
      @for (line of lines(); track line; let i = $index) {
        <li [attr.data-line-index]="i" [attr.aria-labelledby]="'line-' + i + '-title'">
          <app-order-line-editor
            [line]="line"
            [index]="i"
            [form]="form()"
            [sites]="directory().sites()"
            [users]="directory().users()"
            [numbers]="directory().availableNumbers()"
            [devices]="directory().devices()"
            [takenNumbers]="takenNumbers().get(line) ?? none"
            [takenUsers]="takenUsers().get(line) ?? none"
            [emailDomain]="emailDomain()"
            [canDuplicate]="!full()"
            (duplicate)="duplicate(i)"
            (remove)="remove(i)"
          />
        </li>
      }
    </ol>

    <div class="add" role="group" aria-label="Add a line">
      <button matButton="tonal" type="button" [disabled]="full()" (click)="addUser()">
        <mat-icon svgIcon="person_add" />
        Add user
      </button>
      <button matButton="tonal" type="button" [disabled]="full()" (click)="changeUser()">
        <mat-icon svgIcon="manage_accounts" />
        Change user
      </button>
      <button matButton="tonal" type="button" [disabled]="full()" (click)="removeUser()">
        <mat-icon svgIcon="person_remove" />
        Remove user
      </button>
      @if (full()) {
        <p class="limit">An order can have at most {{ maxLines }} lines.</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--app-space-4);
    }
    .lines {
      display: flex;
      flex-direction: column;
      gap: var(--app-space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .add {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--app-space-2);
    }
    .limit {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class OrderBuilder {
  readonly form = input.required<OrderForm>();
  readonly directory = input.required<AccountDirectory>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly maxLines = MAX_ORDER_LINES;

  private readonly tick = watchControl(computed(() => this.form().lines));
  protected readonly lines = computed(() => {
    this.tick();
    return [...this.form().lines.controls];
  });
  protected readonly full = computed(() => this.lines().length >= MAX_ORDER_LINES);

  protected readonly emailDomain = computed(
    () => this.directory().account()?.primaryContact.email.split('@')[1] ?? '',
  );

  protected readonly none: ReadonlySet<string> = new Set();

  /** For each line, the numbers chosen on the other lines, so no two lines pick the same one. */
  protected readonly takenNumbers = computed(() =>
    othersOf(this.lines(), (line) => (isAddLine(line) ? line.controls.did.value || null : null)),
  );

  /** For each line, the users the other lines already change or remove. */
  protected readonly takenUsers = computed(() =>
    othersOf(this.lines(), (line) => (isAddLine(line) ? null : (pickedUser(line)?.id ?? null))),
  );

  protected addUser(): void {
    this.form().addUser();
    this.focusLine(this.form().length - 1);
  }

  protected changeUser(): void {
    this.form().changeUser();
    this.focusLine(this.form().length - 1);
  }

  protected removeUser(): void {
    this.form().removeUser();
    this.focusLine(this.form().length - 1);
  }

  protected duplicate(index: number): void {
    this.form().duplicate(index);
    this.focusLine(index + 1);
  }

  protected remove(index: number): void {
    this.form().remove(index);
    const remaining = this.form().length;
    if (remaining === 0) {
      this.focusAfterRender(() => this.host.nativeElement.querySelector('.add button'));
    } else {
      this.focusLine(Math.min(index, remaining - 1));
    }
  }

  /** Focuses the first field of a line once it is on screen. */
  focusLine(index: number): void {
    this.focusAfterRender(() =>
      this.host.nativeElement.querySelector(`[data-line-index="${index}"] [data-autofocus]`),
    );
  }

  private focusAfterRender(find: () => Element | null): void {
    afterNextRender(
      () => {
        const target = find() as HTMLElement | null;
        target?.focus();
        target?.scrollIntoView?.({ block: 'nearest' });
      },
      { injector: this.injector },
    );
  }
}

/** For each line, the values that the other lines hold. */
function othersOf(
  lines: readonly OrderLine[],
  valueOf: (line: OrderLine) => string | null,
): Map<OrderLine, ReadonlySet<string>> {
  const values = lines.map(valueOf);
  return new Map(
    lines.map((line, i) => [
      line,
      new Set(values.filter((value, j): value is string => value !== null && j !== i)),
    ]),
  );
}
