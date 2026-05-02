import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/theme/theme.service';

@Component({
  selector: 'app-reset-password',
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
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly theme = inject(ThemeService);

  protected resetToken: string | null = null;

  private readonly confirmPasswordValidator: ValidatorFn = (
    control: AbstractControl,
  ): ValidationErrors | null => {
    const parent = control.parent;
    if (!parent) {
      return null;
    }
    const pw = parent.get('newPassword')?.value as string;
    if (!control.value) {
      return null;
    }
    return pw === control.value ? null : { mismatch: true };
  };

  readonly form = this.fb.nonNullable.group({
    newPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required, this.confirmPasswordValidator]],
  });

  hidePassword = true;
  hideConfirm = true;

  protected readonly errorMessage = signal<string | null>(null);
  protected readonly submitting = signal(false);

  ngOnInit(): void {
    this.resetToken = this.route.snapshot.queryParamMap.get('token')?.trim() ?? null;
    if (!this.resetToken) {
      this.errorMessage.set('This reset link is invalid or incomplete.');
    }

    this.form.controls.newPassword.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.form.controls.confirmPassword.updateValueAndValidity({ emitEvent: false });
      });
  }

  submit(): void {
    if (!this.resetToken) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.errorMessage.set(null);
    this.submitting.set(true);
    const { newPassword } = this.form.getRawValue();
    this.auth.resetPassword(this.resetToken, newPassword).subscribe({
      next: () => {
        this.submitting.set(false);
        void this.router.navigate(['/login'], {
          queryParams: { passwordReset: '1' },
          replaceUrl: true,
        });
      },
      error: (err) => {
        this.submitting.set(false);
        this.errorMessage.set(AuthService.parseErrorMessage(err));
      },
    });
  }
}
