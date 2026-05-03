import { Component, OnInit } from '@angular/core';
import { BusinessCardsService, PrintfulProduct, ProductDetail, ProductVariant, ShippingAddress, BusinessCardOrder, OptionField } from '../../services/business-cards.service';

@Component({
  selector: 'app-business-cards',
  templateUrl: './business-cards.component.html',
  styleUrls: ['./business-cards.component.css']
})
export class BusinessCardsComponent implements OnInit {
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

  // Order form
  showOrderForm = false;
  shippingAddress: ShippingAddress = {
    name: '', address1: '', address2: '', city: '', state: '', zip: '', phone: ''
  };
  ordering = false;
  orderSuccess = '';
  orderError = '';

  // Order history
  orders: BusinessCardOrder[] = [];
  loadingOrders = false;
  showOrders = false;

  constructor(private businessCardsService: BusinessCardsService) {}

  ngOnInit(): void {
    this.loadProducts();
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
    this.showOrderForm = false;
    this.orderSuccess = '';
    this.orderError = '';

    this.businessCardsService.getProductDetail(product.id).subscribe({
      next: (res) => {
        this.selectedProduct = res.product;
        // Initialize text fields
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
  }

  proceedToOrder(): void {
    this.showOrderForm = true;
    this.orderError = '';
  }

  cancelOrder(): void {
    this.showOrderForm = false;
    this.orderError = '';
  }

  backToProducts(): void {
    this.selectedProduct = null;
    this.selectedVariant = null;
    this.showOrderForm = false;
    this.orderError = '';
  }

  placeOrder(): void {
    if (!this.selectedVariant) return;
    if (!this.isAddressValid()) {
      this.orderError = 'Please fill in all required shipping fields.';
      return;
    }

    this.ordering = true;
    this.orderError = '';

    // Build textValues map (label → value) for personalization
    const textVals = this.selectedProduct?.textFields?.length
      ? this.textValues
      : undefined;

    this.businessCardsService.placeOrder(this.selectedVariant.id, this.quantity, this.shippingAddress, textVals).subscribe({
      next: (res) => {
        this.orderSuccess = res.message;
        this.ordering = false;
        this.showOrderForm = false;
        this.selectedProduct = null;
        this.selectedVariant = null;
      },
      error: (err) => {
        this.orderError = err?.error?.message || 'Order failed. Please try again.';
        this.ordering = false;
      }
    });
  }

  loadOrders(): void {
    this.showOrders = !this.showOrders;
    if (this.showOrders && this.orders.length === 0) {
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
}
