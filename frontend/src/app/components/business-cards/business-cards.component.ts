import { Component, OnInit, OnDestroy } from '@angular/core';
import { BusinessCardsService, PrintfulProduct, ProductDetail, ProductVariant, ShippingAddress, PrintfulOrderRecord, CardTemplate } from '../../services/business-cards.service';
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

  // Card templates (self-hosted personalization render)
  templates: CardTemplate[] = [];
  activeTemplate: CardTemplate | null = null;
  cardFieldValues: { [key: string]: string } = {};
  photoUrl = '';
  photoUploading = false;
  photoError = '';
  previewUrl = '';
  previewLoading = false;
  previewError = '';
  private previewTimer: any = null;

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
    this.loadTemplates();
    this.initStripe();
  }

  loadTemplates(): void {
    this.businessCardsService.getTemplates().subscribe({
      next: (res) => { this.templates = res.templates || []; },
      error: () => { this.templates = []; }
    });
  }

  /** True when the selected product has a personalization template. */
  get isTemplated(): boolean {
    return !!this.activeTemplate;
  }

  private resetPersonalization(): void {
    this.activeTemplate = null;
    this.cardFieldValues = {};
    this.photoUrl = '';
    this.photoError = '';
    this.previewUrl = '';
    this.previewError = '';
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
    this.resetPersonalization();

    // Match a personalization template to this Printful product, if any.
    this.activeTemplate = this.templates.find(t => t.syncProductId === product.id) || null;
    if (this.activeTemplate) {
      for (const side of this.activeTemplate.sides) {
        for (const f of side.fields) {
          if (!(f.key in this.cardFieldValues)) this.cardFieldValues[f.key] = '';
        }
      }
    }

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

  // ── Personalized Card (template render) ──

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (!file) return;
    this.photoError = '';
    this.photoUploading = true;
    this.businessCardsService.uploadPhoto(file).subscribe({
      next: (res) => {
        this.photoUrl = res.photoUrl;
        this.photoUploading = false;
        this.schedulePreview();
      },
      error: (err) => {
        this.photoError = err?.error?.message || 'Photo upload failed.';
        this.photoUploading = false;
      }
    });
  }

  /** Debounced live preview so typing doesn't fire a render per keystroke. */
  schedulePreview(): void {
    if (!this.activeTemplate) return;
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.updateCardPreview(), 600);
  }

  updateCardPreview(): void {
    if (!this.activeTemplate) return;
    this.previewLoading = true;
    this.previewError = '';
    this.businessCardsService.renderPreview(
      this.activeTemplate.id, this.cardFieldValues, this.photoUrl || undefined
    ).subscribe({
      next: (res) => {
        this.previewUrl = res.previewUrl;
        this.previewLoading = false;
      },
      error: (err) => {
        this.previewError = err?.error?.message || 'Preview failed.';
        this.previewLoading = false;
      }
    });
  }

  /** All required template fields filled (used to gate checkout). */
  get personalizationComplete(): boolean {
    if (!this.activeTemplate) return true;
    for (const side of this.activeTemplate.sides) {
      for (const f of side.fields) {
        if (f.required && !(this.cardFieldValues[f.key] || '').trim()) return false;
      }
    }
    return true;
  }

  /** Whether any side of the active template expects a headshot. */
  get templateNeedsPhoto(): boolean {
    return !!this.activeTemplate && this.activeTemplate.sides.some(s => s.hasPhoto);
  }

  /** Unique fields across all sides (a key shared by front+back is shown once). */
  get personalizationFields(): { key: string; label: string; required: boolean }[] {
    if (!this.activeTemplate) return [];
    const seen = new Set<string>();
    const out: { key: string; label: string; required: boolean }[] = [];
    for (const side of this.activeTemplate.sides) {
      for (const f of side.fields) {
        if (!seen.has(f.key)) { seen.add(f.key); out.push(f); }
      }
    }
    return out;
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

    if (this.activeTemplate && !this.personalizationComplete) {
      this.orderError = 'Please complete all required card fields before continuing.';
      this.checkoutStep = 'product';
      return;
    }

    this.processing = true;
    this.orderError = '';

    // For templated cards the print render keys off the template field keys,
    // so send cardFieldValues; otherwise fall back to the legacy text fields.
    const textVals = this.activeTemplate
      ? this.cardFieldValues
      : (this.selectedProduct?.textFields?.length ? this.textValues : undefined);

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
      mockupUrl: this.previewUrl || this.mockupUrl || undefined,
      templateId: this.activeTemplate?.id,
      photoUrl: this.photoUrl || undefined
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
    this.resetPersonalization();
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
