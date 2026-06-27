import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { PaymentService } from '../../../services/payment.service';
import { PublicService } from '../../../services/public.service';
import { AuthService } from '../../../services/auth.service';
import { OnboardingService } from '../../../services/onboarding.service';
import { PublicConfigService } from '../../../services/public-config.service';
import { loadStripe, Stripe, StripeElements, StripePaymentElement } from '@stripe/stripe-js';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-one-time-payment',
  templateUrl: './one-time-payment.component.html',
  styleUrls: ['./one-time-payment.component.css']
})
export class OneTimePaymentComponent implements OnInit, OnDestroy {
  stripe: Stripe | null = null;
  elements: StripeElements | null = null;
  paymentElement: StripePaymentElement | null = null;
  
  loading = true;
  processing = false;
  error = '';
  success = false;
  
  clientSecret = '';
  amount = 17900; // $179
  
  paymentStatus: any = null;
  isRegistrationFlow = false;
  private readonly setupFeeType = 'setup_fee';

  constructor(
    private paymentService: PaymentService,
    private publicService: PublicService,
    private authService: AuthService,
    private onboardingService: OnboardingService,
    private router: Router,
    private route: ActivatedRoute,
    private ngZone: NgZone,
    private publicConfig: PublicConfigService
  ) { }

  async ngOnInit() {
    try {
      console.log('=== SETUP FEE PAYMENT INIT ===');
      // Check if this is part of registration flow
      this.route.queryParams.subscribe(params => {
        this.isRegistrationFlow = params['source'] === 'registration';
        console.log('Is registration flow:', this.isRegistrationFlow);
        console.log('Query params:', params);
        
        // After params are set, check payment status
        console.log('Checking payment status...');
        this.checkPaymentStatus();
      });
    } catch (error) {
      console.error('Error in ngOnInit:', error);
      this.error = 'Failed to initialize payment page. Please try again.';
      this.loading = false;
    }
  }

  checkPaymentStatus() {
    console.log('=== CHECKING PAYMENT STATUS ===');
    // For registration flow, skip payment status check
    if (this.isRegistrationFlow) {
      console.log('Registration flow - skipping status check, initializing payment');
      this.initializePayment();
      return;
    }
    
    console.log('Authenticated flow - checking payment status');
    this.paymentService.getPaymentStatus().subscribe({
      next: (response) => {
        console.log('Payment status response:', response);
        this.paymentStatus = response;
        
        if (response.oneTimePaymentCompleted) {
          console.log('Setup fee already completed, redirecting to subscription');
          // Already paid, redirect to subscription
          this.router.navigate(['/subscription-payment']);
        } else {
          console.log('Setup fee not completed, initializing payment');
          // Initialize payment
          this.initializePayment();
        }
      },
      error: (error) => {
        console.error('Error checking payment status:', error);
        console.log('Proceeding to initialize payment anyway');
        this.initializePayment();
      }
    });
  }

  async initializePayment() {
    try {
      // For registration flow, use public endpoint
      if (this.isRegistrationFlow) {
        const pendingApp = JSON.parse(localStorage.getItem('pendingApplication') || '{}');
        const email = pendingApp.formData?.email;
        
        if (!email) {
          this.error = 'Email not found. Please start registration again.';
          this.loading = false;
          return;
        }
        
        console.log('Creating registration payment intent for:', email);
        // Create payment intent via public endpoint
        this.publicService.createRegistrationPaymentIntent(email).subscribe({
          next: async (response) => {
            console.log('Payment intent created:', response);
            await this.setupStripeElements(response.clientSecret, response.amount);
          },
          error: (error) => {
            console.error('Payment intent error:', error);
            this.error = error.error?.message || 'Failed to initialize payment. Please try again or contact support.';
            this.loading = false;
          }
        });
      } else {
        console.log('Creating authenticated payment intent');
        // Regular authenticated payment
        this.paymentService.createSetupFeePaymentIntent().subscribe({
          next: async (response) => {
            console.log('Payment intent created:', response);
            await this.setupStripeElements(response.clientSecret, response.amount);
          },
          error: (error) => {
            console.error('Payment intent error:', error);
            this.error = error.error?.message || 'Failed to initialize payment. Please try again or contact support.';
            this.loading = false;
          }
        });
      }
    } catch (error: any) {
      console.error('Payment initialization error:', error);
      this.error = 'Failed to initialize payment system. Please refresh the page.';
      this.loading = false;
    }
  }

  async setupStripeElements(clientSecret: string, amount: number) {
    try {
      this.clientSecret = clientSecret;
      this.amount = amount;
      
      // Initialize Stripe with the publishable key served from the backend .env
      const publishableKey = await this.publicConfig.stripeKey();
      this.stripe = await loadStripe(publishableKey);
      
      if (!this.stripe) {
        this.error = 'Failed to load payment system. Please check your internet connection.';
        this.loading = false;
        return;
      }

      console.log('Stripe loaded successfully, creating payment element');

      // Create payment element first
      this.elements = this.stripe.elements({
        clientSecret: this.clientSecret,
        appearance: {
          theme: 'stripe'
        }
      });

      this.paymentElement = this.elements.create('payment');
      console.log('Payment element created, setting loading to false');
      
      // Update loading state FIRST so ngIf shows the div
      this.loading = false;

      // Run Stripe mounting outside Angular zone to prevent interference
      this.ngZone.runOutsideAngular(() => {
        // Give Angular time to render the div after loading = false
        setTimeout(() => {
          const element = document.getElementById('payment-element');
          console.log('Looking for payment-element div after DOM update:', element);
          
          if (element && this.paymentElement) {
            this.paymentElement.mount('#payment-element');
            console.log('Payment element mounted successfully outside Angular zone');
          } else {
            console.error('Payment element div not found in DOM');
            this.ngZone.run(() => {
              this.error = 'Failed to initialize payment form. Please refresh the page.';
            });
          }
        }, 200);
      });
      
    } catch (error: any) {
      console.error('Stripe setup error:', error);
      this.error = 'Failed to initialize Stripe: ' + (error.message || 'Unknown error');
      this.loading = false;
    }
  }

  async handleSubmit(event?: Event) {
    console.log('=== PAYMENT BUTTON CLICKED ===');
    console.log('Stripe:', this.stripe);
    console.log('Elements:', this.elements);
    console.log('Client Secret:', this.clientSecret);
    console.log('Processing:', this.processing);
    console.log('Payment Element:', this.paymentElement);
    
    if (event) {
      event.preventDefault();
    }

    if (!this.stripe || !this.elements || !this.paymentElement) {
      console.error('Stripe, Elements, or PaymentElement not initialized');
      this.error = 'Payment system not initialized. Please refresh and try again.';
      return;
    }

    if (!this.clientSecret) {
      console.error('No client secret');
      this.error = 'Payment not ready. Please wait or refresh the page.';
      return;
    }
    
    // Verify element is still in DOM
    const elementInDom = document.getElementById('payment-element');
    if (!elementInDom) {
      console.error('Payment element no longer in DOM');
      this.error = 'Payment form lost. Please refresh the page.';
      return;
    }

    this.processing = true;
    this.error = '';
    
    console.log('Confirming payment...');

    // Capture references for the closure (TypeScript null safety)
    const stripe = this.stripe;
    const elements = this.elements;

    // Run payment confirmation outside Angular zone
    this.ngZone.runOutsideAngular(async () => {
      try {
        const result = await stripe!.confirmPayment({
          elements: elements!,
          confirmParams: {
            return_url: `${environment.appUrl}/payment-success?type=${this.setupFeeType}`,
          },
        });

        console.log('Payment confirmation result:', result);

        // Update UI state back in Angular zone
        this.ngZone.run(() => {
          if (result.error) {
            this.error = result.error.message || 'Payment failed';
            this.processing = false;
          }
          // If successful, Stripe will redirect automatically
        });
      } catch (err: any) {
        console.error('Payment error:', err);
        this.ngZone.run(() => {
          this.error = err.message || 'An unexpected error occurred';
          this.processing = false;
        });
      }
    });
  }

  ngOnDestroy() {
    if (this.paymentElement) {
      this.paymentElement.unmount();
    }
  }

  formatAmount(cents: number): string {
    return (cents / 100).toFixed(2);
  }
}
