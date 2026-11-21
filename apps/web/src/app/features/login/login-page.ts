import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth';
import { safeReturnUrl } from '../../core/auth/auth-guards';
import { AuthError } from '../../core/auth/auth-strategy';
import { AppConfig } from '../../core/config/app-config';
import { ThemeToggle } from '../../layout/theme-toggle/theme-toggle';
import { BrandMark } from '../../shared/ui/brand-mark/brand-mark';

/**
 * Demo operator of the local harness (services/api/src/local/demo-users.ts).
 * Shown only when auth mode is `local`; it protects nothing.
 */
export const DEMO_ACCOUNT = { email: 'admin@example.com', password: 'portal-demo' } as const;

@Component({
  selector: 'app-login-page',
  imports: [
    BrandMark,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
    ThemeToggle,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly errorBanner = viewChild<ElementRef<HTMLElement>>('errorBanner');

  /** `?returnUrl=` from the guard or an expired session. */
  readonly returnUrl = input<string>();

  protected readonly isLocal = inject(AppConfig).value.auth.mode === 'local';
  protected readonly demo = DEMO_ACCOUNT;
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly passwordVisible = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected submit(): void {
    if (this.submitting()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.host.nativeElement.querySelector<HTMLElement>('input.ng-invalid')?.focus();
      return;
    }
    this.error.set(null);
    this.submitting.set(true);
    this.form.disable();

    const { email, password } = this.form.getRawValue();
    this.auth
      .signIn({ email: email.trim(), password })
      .pipe(
        finalize(() => {
          this.submitting.set(false);
          this.form.enable();
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => void this.router.navigateByUrl(safeReturnUrl(this.returnUrl())),
        error: (error: unknown) => {
          this.error.set(error instanceof AuthError ? error.message : 'Sign-in failed. Try again.');
          // Move focus to the message so it is read out and visible on small screens.
          afterNextRender(() => this.errorBanner()?.nativeElement.focus(), {
            injector: this.injector,
          });
        },
      });
  }

  protected useDemoAccount(): void {
    this.form.setValue({ email: this.demo.email, password: this.demo.password });
    this.host.nativeElement.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus();
  }
}
