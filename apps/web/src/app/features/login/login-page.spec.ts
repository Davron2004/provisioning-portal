import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { COGNITO_CONFIG, provideTestConfig } from '../../../testing/test-config';
import { AuthService } from '../../core/auth/auth';
import { AuthError, Session } from '../../core/auth/auth-strategy';
import { provideAppIcons } from '../../core/icons/icons';
import { LoginPage } from './login-page';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let host: HTMLElement;
  let signIn: ReturnType<typeof vi.fn>;

  const setup = async (config = provideTestConfig()) => {
    signIn = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideAppIcons(),
        config,
        { provide: AuthService, useValue: { signIn } },
      ],
    });
    fixture = TestBed.createComponent(LoginPage);
    host = fixture.nativeElement;
    await fixture.whenStable();
  };

  const type = (name: string, value: string) => {
    const input = host.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
  };

  const submit = async () => {
    host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
  };

  const errors = () => [...host.querySelectorAll('mat-error')].map((e) => e.textContent?.trim());

  it('explains what is missing instead of submitting an empty form', async () => {
    await setup();
    await submit();

    expect(signIn).not.toHaveBeenCalled();
    expect(errors()).toEqual(['Enter your email address.', 'Enter your password.']);
  });

  it('rejects a malformed email', async () => {
    await setup();
    type('email', 'admin@');
    type('password', 'secret');
    await submit();

    expect(signIn).not.toHaveBeenCalled();
    expect(errors()).toEqual(['Enter a valid email address, like name@example.com.']);
  });

  it('signs in and returns to the requested page', async () => {
    await setup();
    signIn.mockReturnValue(of({} as Session));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture.componentRef.setInput('returnUrl', '/orders?status=failed');

    type('email', ' admin@example.com ');
    type('password', 'secret');
    await submit();

    expect(signIn).toHaveBeenCalledWith({ email: 'admin@example.com', password: 'secret' });
    expect(navigate).toHaveBeenCalledWith('/orders?status=failed');
  });

  it('ignores an off-site return URL', async () => {
    await setup();
    signIn.mockReturnValue(of({} as Session));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture.componentRef.setInput('returnUrl', 'https://evil.example');

    type('email', 'admin@example.com');
    type('password', 'secret');
    await submit();

    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('shows progress, then the error, and lets the person try again', async () => {
    await setup();
    const response = new Subject<Session>();
    signIn.mockReturnValue(response);

    type('email', 'admin@example.com');
    type('password', 'wrong');
    await submit();

    const button = host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Signing in');

    response.error(new AuthError('Incorrect email or password.'));
    await fixture.whenStable();

    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Incorrect email or password.',
    );
    expect(button.disabled).toBe(false);
    expect(host.querySelector<HTMLInputElement>('input[name="email"]')!.disabled).toBe(false);
  });

  it('offers the demo account only in local mode', async () => {
    await setup();
    expect(host.textContent).toContain('admin@example.com');
    host.querySelector<HTMLButtonElement>('.demo-email')!.click();
    await fixture.whenStable();
    expect(host.querySelector<HTMLInputElement>('input[name="email"]')!.value).toBe(
      'admin@example.com',
    );

    TestBed.resetTestingModule();
    await setup(provideTestConfig(COGNITO_CONFIG));
    expect(host.querySelector('.demo')).toBeNull();
  });
});
