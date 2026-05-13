import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface PrintfulProduct {
  id: number;
  externalId: string;
  name: string;
  variants: number;
  synced: number;
  thumbnail: string;
}

export interface ProductVariant {
  id: number;
  variantId: number;
  name: string;
  sku: string;
  price: string;
  currency: string;
  thumbnail: string;
}

export interface OptionField {
  id: string;
  label: string;
  required: boolean;
}

export interface ProductDetail {
  id: number;
  name: string;
  thumbnail: string;
  textFields: OptionField[];
  variants: ProductVariant[];
}

export interface ShippingAddress {
  name: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
  phone?: string;
}

export interface PrintfulOrderRecord {
  id: string;
  printfulOrderId: number | null;
  productName: string;
  variantName: string;
  thumbnail: string;
  quantity: number;
  unitPrice: number;
  total: number;
  subtotal: number;
  paymentStatus: string;
  adminStatus: string;
  printfulStatus: string;
  receiptUrl: string;
  shippingAddress: ShippingAddress;
  textValues: { [key: string]: string };
  mockupUrl: string;
  adminNotes: string;
  created: string;
  paidAt: string;
}

export interface AdminOrderRecord {
  id: string;
  user: { id?: string; name: string; email: string };
  product: {
    name: string;
    variantId: number;
    variantName: string;
    sku: string;
    thumbnail: string;
    unitPrice: number;
    quantity: number;
  };
  textValues: { [key: string]: string };
  mockupUrl: string;
  shippingAddress: ShippingAddress;
  subtotal: number;
  shipping: number;
  total: number;
  paymentStatus: string;
  adminStatus: string;
  adminNotes: string;
  printfulOrderId: number | null;
  printfulStatus: string;
  stripePaymentIntentId: string;
  receiptUrl: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  paidAt: string | null;
  created: string;
}

export interface PrintfulAdminConfig {
  apiKey: string;
  hasApiKey: boolean;
  storeId: string;
  enabled: boolean;
  textFields: OptionField[];
}

@Injectable({
  providedIn: 'root'
})
export class BusinessCardsService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // ── Agent Product Browsing ──

  getProducts(): Observable<{ enabled: boolean; products: PrintfulProduct[] }> {
    return this.http.get<{ enabled: boolean; products: PrintfulProduct[] }>(`${this.apiUrl}/business-cards/products`);
  }

  getProductDetail(id: number): Observable<{ product: ProductDetail }> {
    return this.http.get<{ product: ProductDetail }>(`${this.apiUrl}/business-cards/products/${id}`);
  }

  // ── Mockup Generator ──

  generateMockup(productId: number, variantIds?: number[], textValues?: { [key: string]: string }, imageUrl?: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/business-cards/mockup`, {
      productId, variantIds, textValues, imageUrl
    });
  }

  checkMockupStatus(taskKey: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/business-cards/mockup/status/${taskKey}`);
  }

  // ── Shipping Estimate ──

  getShippingEstimate(variantId: number, quantity: number, shippingAddress: ShippingAddress): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/business-cards/estimate`, {
      variantId, quantity, shippingAddress
    });
  }

  // ── Checkout / Payment ──

  createCheckout(data: {
    variantId: number;
    variantName: string;
    productName: string;
    productThumbnail: string;
    sku: string;
    unitPrice: string;
    quantity: number;
    shippingAddress: ShippingAddress;
    textValues?: { [key: string]: string };
    mockupUrl?: string;
  }): Observable<{ orderId: string; clientSecret: string; total: number; subtotal: number; shipping: number }> {
    return this.http.post<any>(`${this.apiUrl}/business-cards/checkout`, data);
  }

  confirmCheckout(orderId: string, paymentIntentId: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/business-cards/checkout/confirm`, { orderId, paymentIntentId });
  }

  // ── Agent Orders ──

  getOrders(): Observable<{ orders: PrintfulOrderRecord[] }> {
    return this.http.get<{ orders: PrintfulOrderRecord[] }>(`${this.apiUrl}/business-cards/orders`);
  }

  // ── Admin Config ──

  getAdminConfig(): Observable<{ config: PrintfulAdminConfig }> {
    return this.http.get<{ config: PrintfulAdminConfig }>(`${this.apiUrl}/business-cards/admin/config`);
  }

  updateConfig(body: Partial<{ apiKey: string; storeId: string; enabled: boolean; textFields: OptionField[] }>): Observable<{ message: string; config: PrintfulAdminConfig }> {
    return this.http.post<{ message: string; config: PrintfulAdminConfig }>(`${this.apiUrl}/business-cards/admin/config`, body);
  }

  testConnection(): Observable<{ message: string; store: any }> {
    return this.http.post<{ message: string; store: any }>(`${this.apiUrl}/business-cards/admin/test-connection`, {});
  }

  // ── Admin Order Management ──

  getAdminOrders(params?: { adminStatus?: string; paymentStatus?: string; page?: number; limit?: number; search?: string }): Observable<{
    orders: AdminOrderRecord[];
    total: number;
    page: number;
    pages: number;
    counts: { pending: number; approved: number; rejected: number; total: number };
  }> {
    return this.http.get<any>(`${this.apiUrl}/business-cards/admin/orders`, { params: params as any });
  }

  getAdminOrderDetail(id: string): Observable<{ order: any }> {
    return this.http.get<any>(`${this.apiUrl}/business-cards/admin/orders/${id}`);
  }

  approveOrder(id: string, notes?: string): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/business-cards/admin/orders/${id}/approve`, { notes });
  }

  rejectOrder(id: string, notes?: string): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/business-cards/admin/orders/${id}/reject`, { notes });
  }

  updateOrderNotes(id: string, notes: string): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/business-cards/admin/orders/${id}/notes`, { notes });
  }

  deleteOrder(id: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/business-cards/admin/orders/${id}`);
  }

  getOrderReceipt(id: string): Observable<{ receipt: any }> {
    return this.http.get<any>(`${this.apiUrl}/business-cards/admin/orders/${id}/receipt`);
  }
}
