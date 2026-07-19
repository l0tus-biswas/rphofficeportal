import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { PublicService } from '../../services/public.service';
import { BrandingService, BrandingConfig } from '../../services/branding.service';
import { environment } from '../../../environments/environment';

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
  isPendingSignature = false;
  docusignUrl = '';
  
  paymentForm!: FormGroup;
  branding: BrandingConfig = { appName: 'RHP Office', appLogo: null };
  
  monthlyFee = 20;
  couponApplied = false;
  appliedCouponCode = '';
  couponDiscount = 0;
  couponLoading = false;
  
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

  getLogoUrl(): string {
    return this.branding.appLogo || '';
  }

  initializeForm(): void {
    this.paymentForm = this.formBuilder.group({
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
        
        // Check if signature is still pending
        if (app.status === 'pending_signature') {
          this.isPendingSignature = true;
          this.error = `Application is not ready for payment (status: ${app.status})`;
          
          // Get DocuSign URL if envelope exists
          if (app.docusign?.envelopeId) {
            this.docusignUrl = response.docusignUrl || '';
          }
          return;
        }
        
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
    const code = this.paymentForm.get('couponCode')?.value?.trim().toUpperCase();
    if (!code) return;

    this.couponLoading = true;
    this.error = '';

    this.publicService.verifyCoupon(code).subscribe({
      next: (response) => {
        this.couponLoading = false;
        if (!response.valid) {
          this.error = response.message || `Coupon "${code}" is not valid.`;
          return;
        }

        this.couponApplied = true;
        this.appliedCouponCode = response.code;
        this.couponDiscount = response.discount;
        this.paymentForm.get('couponCode')?.disable();
      },
      error: (error) => {
        this.couponLoading = false;
        this.error = error.error?.message || `Failed to verify coupon "${code}".`;
      }
    });
  }

  removeCoupon(): void {
    this.couponApplied = false;
    this.appliedCouponCode = '';
    this.couponDiscount = 0;
    this.paymentForm.get('couponCode')?.enable();
    this.paymentForm.get('couponCode')?.setValue('');
  }

  get totalAmount(): number {
    return this.couponApplied ? Math.max(this.monthlyFee - this.couponDiscount, 0) : this.monthlyFee;
  }

  proceedToSign(): void {
    // Try to resend DocuSign if no URL available
    if (!this.docusignUrl) {
      this.loading = true;
      this.publicService.resendDocuSign(this.applicationId).subscribe({
        next: (response) => {
          this.loading = false;
          if (response.docusignUrl) {
            window.location.href = response.docusignUrl;
          } else {
            this.error = 'Unable to retrieve DocuSign URL. Please contact support.';
          }
        },
        error: (error) => {
          this.loading = false;
          this.error = error.error?.message || 'Failed to get signing link';
        }
      });
    } else {
      window.location.href = this.docusignUrl;
    }
  }

  submitPayment(): void {
    const authCheckbox = this.paymentForm.get('authorizeMonthly');
    if (!authCheckbox?.value) {
      authCheckbox?.markAsTouched();
      this.error = 'Please authorize the monthly subscription to continue';
      return;
    }

    this.loading = true;
    this.error = '';

    console.log('=== Creating Stripe Checkout Session ===');
    console.log('Application ID:', this.applicationId);
    console.log('Coupon Code:', this.appliedCouponCode || 'None');

    this.publicService.createCheckoutSession(this.applicationId, this.appliedCouponCode || undefined).subscribe({
      next: (response) => {
        console.log('Checkout session created:', response);
        
        // Redirect to Stripe Checkout
        if (response.url) {
          window.location.href = response.url;
        } else {
          this.loading = false;
          this.error = 'Failed to create checkout session';
        }
      },
      error: (error) => {
        console.error('=== Checkout Session Error ===');
        console.error('Error details:', error);
        
        this.loading = false;
        this.error = error.error?.message || 'Failed to create payment session. Please try again.';
      }
    });
  }

  navigateToLogin(): void {
    console.log('Navigating to login page...');
    this.router.navigate(['/login'], {
      queryParams: { message: 'Account created successfully. Check your email for login credentials.' }
    });
  }
}
