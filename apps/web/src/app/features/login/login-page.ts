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

/** Demo account seeded by the local harness. */
export const DEMO_EMAIL = 'admin@example.com';

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
  protected readonly demoEmail = DEMO_EMAIL;
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
    this.form.controls.email.setValue(this.demoEmail);
    this.host.nativeElement.querySelector<HTMLInputElement>('input[name="password"]')?.focus();
  }
}
