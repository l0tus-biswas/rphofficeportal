import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { PaymentService } from '../../../services/payment.service';
import { PublicConfigService } from '../../../services/public-config.service';
import { loadStripe, Stripe, StripeElements, StripePaymentElement } from '@stripe/stripe-js';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-subscription-payment',
  templateUrl: './subscription-payment.component.html',
  styleUrls: ['./subscription-payment.component.css']
})
export class SubscriptionPaymentComponent implements OnInit, OnDestroy {
  stripe: Stripe | null = null;
  elements: StripeElements | null = null;
  paymentElement: StripePaymentElement | null = null;
  
  loading = true;
  processing = false;
  error = '';
  success = false;
  
  clientSecret = '';
  amount = 2500; // $25
  
  paymentStatus: any = null;

  constructor(
    private paymentService: PaymentService,
    private router: Router,
    private publicConfig: PublicConfigService
  ) { }

  async ngOnInit() {
    // Check payment status
    this.checkPaymentStatus();
  }

  checkPaymentStatus() {
    this.paymentService.getPaymentStatus().subscribe({
      next: (response) => {
        this.paymentStatus = response;
        
        if (!response.oneTimePaymentCompleted) {
          // Must complete setup fee payment first
          this.router.navigate(['/one-time-payment']);
        } else if (response.subscriptionStatus === 'active') {
          // Already subscribed
          this.router.navigate(['/dashboard']);
        } else {
          // Initialize subscription
          this.initializeSubscription();
        }
      },
      error: (error) => {
        this.error = 'Failed to load payment status';
        this.loading = false;
      }
    });
  }

  async initializeSubscription() {
    try {
      this.paymentService.createSubscriptionIntent().subscribe({
        next: async (response) => {
          this.clientSecret = response.clientSecret;
          
          // Initialize Stripe with the publishable key served from backend .env
          this.stripe = await loadStripe(await this.publicConfig.stripeKey());
          
          if (!this.stripe) {
            this.error = 'Failed to load payment system';
            this.loading = false;
            return;
          }

          // Create payment element
          this.elements = this.stripe.elements({
            clientSecret: this.clientSecret,
            appearance: {
              theme: 'stripe'
            }
          });

          this.paymentElement = this.elements.create('payment');
          this.paymentElement.mount('#payment-element');
          
          this.loading = false;
        },
        error: (error) => {
          this.error = error.error?.message || 'Failed to initialize subscription';
          this.loading = false;
        }
      });
    } catch (error) {
      console.error('Subscription initialization error:', error);
      this.error = 'Failed to initialize payment system';
      this.loading = false;
    }
  }

  async handleSubmit() {
    if (!this.stripe || !this.elements) {
      return;
    }

    this.processing = true;
    this.error = '';

    const { error } = await this.stripe.confirmPayment({
      elements: this.elements,
      confirmParams: {
        return_url: `${environment.appUrl}/payment-success?type=subscription`,
      },
    });

    if (error) {
      this.error = error.message || 'Payment failed';
      this.processing = false;
    }
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
