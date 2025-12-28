import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { PublicService } from '../../services/public.service';
import { BrandingService, BrandingConfig } from '../../services/branding.service';

@Component({
  selector: 'app-apa-payment',
  templateUrl: './apa-payment.component.html',
  styleUrls: ['./apa-payment.component.css']
})
export class ApaPaymentComponent implements OnInit {
  applicationId = '';
  loading = false;
  error = '';
  success = false;
  
  paymentForm!: FormGroup;
  branding: BrandingConfig = { appName: 'Escape', appLogo: null };
  
  onboardingFee = 169;
  monthlyFee = 25;
  onboardingFeeWaived = false;
  couponApplied = false;
  
  applicantName = '';
  applicantEmail = '';
  isLicensed = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private formBuilder: FormBuilder,
    private publicService: PublicService,
    private brandingService: BrandingService
  ) {}

  ngOnInit(): void {
    this.branding = this.brandingService.getCurrentBranding();
    this.applicationId = this.route.snapshot.queryParams['applicationId'] || '';
    
    this.initializeForm();
    
    if (this.applicationId) {
      this.loadApplicationDetails();
    } else {
      this.error = 'Invalid application ID';
    }
  }

  initializeForm(): void {
    this.paymentForm = this.formBuilder.group({
      cardNumber: ['4242424242424242', [Validators.required, Validators.pattern(/^\d{16}$/)]],
      cardExpiry: ['12/25', [Validators.required, Validators.pattern(/^\d{2}\/\d{2}$/)]],
      cardCvc: ['123', [Validators.required, Validators.pattern(/^\d{3,4}$/)]],
      couponCode: [''],
      authorizeMonthly: [false, Validators.requiredTrue]
    });
  }

  loadApplicationDetails(): void {
    this.loading = true;
    this.publicService.getAPAApplicationStatus(this.applicationId).subscribe({
      next: (response) => {
        this.loading = false;
        const app = response.application;
        
        if (app.status !== 'pending_payment') {
          this.error = `Application is not ready for payment (status: ${app.status})`;
          return;
        }
        
        this.applicantName = app.personalInfo.name;
        this.applicantEmail = app.personalInfo.email;
        
        // Check if onboarding fee should be waived based on licensing status
        // This will be fetched from full application details if needed
      },
      error: (error) => {
        this.loading = false;
        this.error = error.error?.message || 'Failed to load application details';
      }
    });
  }

  applyCoupon(): void {
    const code = this.paymentForm.get('couponCode')?.value?.toUpperCase();
    
    if (code === 'LICENSED') {
      this.onboardingFeeWaived = true;
      this.couponApplied = true;
      this.onboardingFee = 0;
    } else if (code) {
      this.error = 'Invalid coupon code';
      setTimeout(() => this.error = '', 3000);
    }
  }

  removeCoupon(): void {
    this.couponApplied = false;
    this.onboardingFeeWaived = false;
    this.onboardingFee = 169;
    this.paymentForm.patchValue({ couponCode: '' });
  }

  get totalAmount(): number {
    return this.onboardingFee + this.monthlyFee;
  }

  submitPayment(): void {
    if (this.paymentForm.invalid) {
      Object.keys(this.paymentForm.controls).forEach(key => {
        this.paymentForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.loading = true;
    this.error = '';

    // Mock payment data
    const paymentData = {
      couponCode: this.couponApplied ? this.paymentForm.get('couponCode')?.value : null,
      mockPayment: {
        paymentIntentId: `pi_mock_${Date.now()}`,
        amount: this.totalAmount * 100, // in cents
        cardLast4: this.paymentForm.get('cardNumber')?.value.slice(-4)
      }
    };

    this.publicService.completePayment(this.applicationId, paymentData).subscribe({
      next: (response) => {
        this.loading = false;
        this.success = true;
        
        // Redirect to login after 5 seconds
        setTimeout(() => {
          this.router.navigate(['/login'], {
            queryParams: { message: 'Account created successfully. Check your email for login credentials.' }
          });
        }, 5000);
      },
      error: (error) => {
        this.loading = false;
        this.error = error.error?.message || 'Payment failed. Please try again.';
      }
    });
  }
}
