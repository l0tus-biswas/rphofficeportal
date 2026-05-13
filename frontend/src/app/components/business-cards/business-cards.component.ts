import { Component, OnInit, OnDestroy } from '@angular/core';
import { BusinessCardsService, PrintfulProduct, ProductDetail, ProductVariant, ShippingAddress, PrintfulOrderRecord } from '../../services/business-cards.service';
import { environment } from '../../../environments/environment';
declare var Stripe: any;

@Component({
  selector: 'app-business-cards',
  templateUrl: './business-cards.component.html',
  styleUrls: ['./business-cards.component.css']
})
export class BusinessCardsComponent implements OnInit, OnDestroy {
  // Products list
  products: PrintfulProduct[] = [];
  loading = true;
  enabled = false;
  error = '';

  // Product detail / ordering
  selectedProduct: ProductDetail | null = null;
  selectedVariant: ProductVariant | null = null;
  loadingDetail = false;
  quantity = 1;
  textValues: { [id: string]: string } = {};

  // Mockup
  mockupUrl = '';
  mockupLoading = false;
  mockupStatus = '';

  // Order form
  showOrderForm = false;
  shippingAddress: ShippingAddress = {
    name: '', address1: '', address2: '', city: '', state: '', zip: '', phone: ''
  };

  // Checkout / payment
  checkoutStep: 'product' | 'shipping' | 'payment' | 'success' = 'product';
  processing = false;
  orderError = '';
  orderSuccess = '';

  // Stripe
  stripe: any = null;
  elements: any = null;
  cardElement: any = null;
  clientSecret = '';
  currentOrderId = '';
  paymentIntentId = '';
  orderTotal = 0;
  orderSubtotal = 0;
  orderShipping = 0;
  receiptUrl = '';

  // Order history
  orders: PrintfulOrderRecord[] = [];
  loadingOrders = false;
  showOrders = false;

  constructor(private businessCardsService: BusinessCardsService) {}

  ngOnInit(): void {
    this.loadProducts();
    this.initStripe();
  }

  ngOnDestroy(): void {
    if (this.cardElement) {
      this.cardElement.destroy();
    }
  }

  async initStripe(): Promise<void> {
    // Load Stripe.js if not already loaded
    if (typeof Stripe === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/';
      script.async = true;
      document.head.appendChild(script);
      await new Promise<void>(resolve => { script.onload = () => resolve(); });
    }
    this.stripe = Stripe(environment.stripePublishableKey);
  }

  loadProducts(): void {
    this.loading = true;
    this.businessCardsService.getProducts().subscribe({
      next: (res) => {
        this.enabled = res.enabled;
        this.products = res.products;
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to load products.';
        this.loading = false;
      }
    });
  }

  selectProduct(product: PrintfulProduct): void {
    this.loadingDetail = true;
    this.selectedProduct = null;
    this.selectedVariant = null;
    this.checkoutStep = 'product';
    this.orderSuccess = '';
    this.orderError = '';
    this.mockupUrl = '';

    this.businessCardsService.getProductDetail(product.id).subscribe({
      next: (res) => {
        this.selectedProduct = res.product;
        this.textValues = {};
        if (res.product.textFields) {
          for (const field of res.product.textFields) {
            this.textValues[field.label] = '';
          }
        }
        if (res.product.variants.length === 1) {
          this.selectedVariant = res.product.variants[0];
        }
        this.loadingDetail = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to load product details.';
        this.loadingDetail = false;
      }
    });
  }

  selectVariant(variant: ProductVariant): void {
    this.selectedVariant = variant;
    this.mockupUrl = '';
    this.mockupStatus = '';
  }

  // ── Mockup Generation ──

  generateMockup(): void {
    if (!this.selectedProduct) return;
    this.mockupLoading = true;
    this.mockupStatus = 'generating';

    const variantIds = this.selectedVariant
      ? [this.selectedVariant.variantId]
      : undefined;

    this.businessCardsService.generateMockup(
      this.selectedProduct.id,
      variantIds,
      Object.keys(this.textValues).length ? this.textValues : undefined
    ).subscribe({
      next: (res) => {
        if (res.mockupUrl) {
          this.mockupUrl = res.mockupUrl;
        }
        this.mockupStatus = res.status || 'completed';

        // If pending, poll for result
        if (res.status === 'pending' && res.taskKey) {
          this.pollMockup(res.taskKey);
        } else {
          this.mockupLoading = false;
        }
      },
      error: () => {
        this.mockupLoading = false;
        this.mockupStatus = 'failed';
      }
    });
  }

  private pollMockup(taskKey: string, attempts = 0): void {
    if (attempts >= 8) {
      this.mockupLoading = false;
      this.mockupStatus = 'timeout';
      return;
    }
    setTimeout(() => {
      this.businessCardsService.checkMockupStatus(taskKey).subscribe({
        next: (res) => {
          if (res.status === 'completed' && res.mockupUrl) {
            this.mockupUrl = res.mockupUrl;
            this.mockupLoading = false;
            this.mockupStatus = 'completed';
          } else if (res.status === 'failed') {
            this.mockupLoading = false;
            this.mockupStatus = 'failed';
          } else {
            this.pollMockup(taskKey, attempts + 1);
          }
        },
        error: () => {
          this.mockupLoading = false;
          this.mockupStatus = 'failed';
        }
      });
    }, 2000);
  }

  // ── Checkout Flow ──

  proceedToShipping(): void {
    this.checkoutStep = 'shipping';
    this.orderError = '';
  }

  backToProduct(): void {
    this.checkoutStep = 'product';
    this.orderError = '';
  }

  proceedToPayment(): void {
    if (!this.selectedVariant || !this.isAddressValid()) {
      this.orderError = 'Please fill in all required shipping fields.';
      return;
    }

    this.processing = true;
    this.orderError = '';

    const textVals = this.selectedProduct?.textFields?.length ? this.textValues : undefined;

    this.businessCardsService.createCheckout({
      variantId: this.selectedVariant.id,
      variantName: this.selectedVariant.name,
      productName: this.selectedProduct?.name || 'Product',
      productThumbnail: this.selectedProduct?.thumbnail || '',
      sku: this.selectedVariant.sku,
      unitPrice: this.selectedVariant.price,
      quantity: this.quantity,
      shippingAddress: this.shippingAddress,
      textValues: textVals,
      mockupUrl: this.mockupUrl || undefined
    }).subscribe({
      next: (res) => {
        this.currentOrderId = res.orderId;
        this.clientSecret = res.clientSecret;
        this.orderTotal = res.total;
        this.orderSubtotal = res.subtotal;
        this.orderShipping = res.shipping;
        this.checkoutStep = 'payment';
        this.processing = false;

        // Mount Stripe card element
        setTimeout(() => this.mountCardElement(), 100);
      },
      error: (err) => {
        this.orderError = err?.error?.message || 'Failed to create checkout. Please try again.';
        this.processing = false;
      }
    });
  }

  private mountCardElement(): void {
    if (!this.stripe) return;

    this.elements = this.stripe.elements({ clientSecret: this.clientSecret });
    this.cardElement = this.elements.create('payment', {
      layout: 'tabs'
    });

    const container = document.getElementById('stripe-payment-element');
    if (container) {
      this.cardElement.mount(container);
    }
  }

  async submitPayment(): Promise<void> {
    if (!this.stripe || !this.elements) return;

    this.processing = true;
    this.orderError = '';

    const { error, paymentIntent } = await this.stripe.confirmPayment({
      elements: this.elements,
      confirmParams: {
        return_url: window.location.href // won't redirect for card payments
      },
      redirect: 'if_required'
    });

    if (error) {
      this.orderError = error.message || 'Payment failed. Please try again.';
      this.processing = false;
      return;
    }

    if (paymentIntent && paymentIntent.status === 'succeeded') {
      this.paymentIntentId = paymentIntent.id;

      // Confirm order on backend
      this.businessCardsService.confirmCheckout(this.currentOrderId, paymentIntent.id).subscribe({
        next: (res) => {
          this.checkoutStep = 'success';
          this.orderSuccess = res.message || 'Payment confirmed! Your order has been submitted.';
          this.receiptUrl = res.order?.receiptUrl || '';
          this.processing = false;
        },
        error: (err) => {
          // Payment succeeded but backend confirmation had issue
          this.checkoutStep = 'success';
          this.orderSuccess = 'Payment received! Your order is being processed.';
          this.processing = false;
        }
      });
    } else {
      this.orderError = 'Payment was not completed. Please try again.';
      this.processing = false;
    }
  }

  backToProducts(): void {
    this.selectedProduct = null;
    this.selectedVariant = null;
    this.checkoutStep = 'product';
    this.orderError = '';
    this.orderSuccess = '';
    this.mockupUrl = '';
    this.mockupStatus = '';
    this.clientSecret = '';
    this.currentOrderId = '';
    if (this.cardElement) {
      this.cardElement.destroy();
      this.cardElement = null;
    }
  }

  startNewOrder(): void {
    this.backToProducts();
    this.loadProducts();
  }

  // ── Order History ──

  loadOrders(): void {
    this.showOrders = !this.showOrders;
    if (this.showOrders) {
      this.loadingOrders = true;
      this.businessCardsService.getOrders().subscribe({
        next: (res) => {
          this.orders = res.orders;
          this.loadingOrders = false;
        },
        error: () => { this.loadingOrders = false; }
      });
    }
  }

  isAddressValid(): boolean {
    return !!(this.shippingAddress.name && this.shippingAddress.address1 &&
              this.shippingAddress.city && this.shippingAddress.state && this.shippingAddress.zip);
  }

  getStatusClass(status: string): string {
    const map: { [key: string]: string } = {
      'pending_review': 'bg-warning text-dark',
      'approved': 'bg-success',
      'rejected': 'bg-danger',
      'paid': 'bg-success',
      'unpaid': 'bg-secondary',
      'pending': 'bg-warning text-dark',
      'refunded': 'bg-info',
      'failed': 'bg-danger',
      'draft': 'bg-warning text-dark',
      'inprocess': 'bg-primary',
      'fulfilled': 'bg-success',
      'canceled': 'bg-danger',
      'not_submitted': 'bg-secondary'
    };
    return map[status] || 'bg-secondary';
  }

  getStatusLabel(status: string): string {
    const map: { [key: string]: string } = {
      'pending_review': 'Pending Review',
      'approved': 'Approved',
      'rejected': 'Rejected',
      'paid': 'Paid',
      'unpaid': 'Unpaid',
      'pending': 'Processing',
      'refunded': 'Refunded',
      'failed': 'Failed',
      'draft': 'Draft',
      'inprocess': 'In Process',
      'fulfilled': 'Fulfilled',
      'canceled': 'Canceled',
      'not_submitted': 'Not Submitted'
    };
    return map[status] || status;
  }
}
