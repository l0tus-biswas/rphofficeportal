import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { PublicService } from '../../services/public.service';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.css']
})
export class ForgotPasswordComponent implements OnInit {
  forgotPasswordForm!: FormGroup;
  loading = false;
  success = false;
  error = '';
  successMessage = '';

  constructor(
    private fb: FormBuilder,
    private publicService: PublicService
  ) {}

  ngOnInit(): void {
    this.forgotPasswordForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  onSubmit(): void {
    if (this.forgotPasswordForm.invalid) {
      this.forgotPasswordForm.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = false;

    this.publicService.forgotPassword(this.forgotPasswordForm.value.email).subscribe({
      next: (response) => {
        this.success = true;
        this.successMessage = response.message || 'Password reset link sent to your email';
        this.loading = false;
        this.forgotPasswordForm.reset();
      },
      error: (error) => {
        this.error = error.error?.message || 'Failed to send reset email. Please try again.';
        this.loading = false;
      }
    });
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.forgotPasswordForm.get(fieldName);
    return !!(field && field.invalid && field.touched);
  }
}
