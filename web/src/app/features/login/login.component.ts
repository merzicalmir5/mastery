import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    RouterLink,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  readonly loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  hidePassword = true;

  protected readonly errorMessage = signal<string | null>(null);
  protected readonly infoMessage = signal<string | null>(null);
  protected readonly submitting = signal(false);
  private infoMessageTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const shouldShowVerificationInfo = this.route.snapshot.queryParamMap.get('verifyEmail') === '1';
    if (shouldShowVerificationInfo) {
      this.infoMessage.set('Registration successful. Check your email and verify your account before login.');
      this.infoMessageTimeoutId = setTimeout(() => {
        this.infoMessage.set(null);
        this.infoMessageTimeoutId = null;
      }, 5000);
    }
  }

  ngOnDestroy(): void {
    if (this.infoMessageTimeoutId) {
      clearTimeout(this.infoMessageTimeoutId);
      this.infoMessageTimeoutId = null;
    }
  }

  submit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.submitting.set(true);
    const { email, password } = this.loginForm.getRawValue();
    this.auth.login(email, password).subscribe({
      next: () => {
        this.submitting.set(false);
        void this.router.navigateByUrl('/dashboard');
      },
      error: (err) => {
        this.submitting.set(false);
        this.errorMessage.set(AuthService.parseErrorMessage(err));
      },
    });
  }
}
