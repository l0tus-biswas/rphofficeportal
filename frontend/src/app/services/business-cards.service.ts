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

// Admin-configured convenience fee added on top of the card price.
export interface ConvenienceFee {
  id?: string;
  label: string;
  amount: number;
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
  sku?: string;
  thumbnail: string;
  quantity: number;
  unitPrice: number;
  total: number;
  subtotal: number;
  shipping?: number;
  fees?: ConvenienceFee[];
  feesTotal?: number;
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
  imgFailed?: boolean;   // UI-only: set when the order thumbnail fails to load
}

export interface AdminOrderRecord {
  id: string;
  user: { id?: string; name: string; email: string };
  cardName?: string;   // resolved designed-card name (e.g. "RHP Business Card (English)")
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
  fees?: ConvenienceFee[];
  feesTotal?: number;
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
  imgFailed?: boolean;   // UI-only: set when the order thumbnail fails to load
}

export interface CardTemplateField {
  key: string;
  label: string;
  required: boolean;
}

export interface CardTemplateSideMeta {
  placement: string;
  label: string;
  hasPhoto: boolean;
  backgroundImage?: string;
  fonts?: any[];
  photo?: any;
  fields: any[];   // full field layout (key,label,required,x,y,style...)
}

export interface CardTemplateVariant {
  label: string;
  syncVariantId: number;
  price: number;
}

// bleedPx: artwork extends this far beyond the trim line (prevents white edge
// after cutting). safePx: extra margin INSIDE the trim line that all text/
// logos must stay within, since normal cutting tolerance can clip anything
// placed closer than that. Both default to 0.125in * dpi when omitted — see
// backend/services/cardRenderer.js#bleedGeometry, the single source of truth.
export interface CardPrintFile {
  widthPx: number;
  heightPx: number;
  dpi: number;
  bleedPx?: number;
  safePx?: number;
}

export interface CardTemplate {
  id: string;
  name: string;
  syncProductId: number;
  previewImage?: string;
  variants: CardTemplateVariant[];
  orientation: string;
  printFile: CardPrintFile;
  sides: CardTemplateSideMeta[];
}

// Full template layout (admin designer + server renderer). The agent-facing
// CardTemplate above is a stripped subset of this.
export interface CardFieldFull {
  key: string;
  label: string;
  required: boolean;
  x: number; y: number; w?: number;
  align?: 'left' | 'center' | 'right';
  family?: string; weight?: number; style?: 'normal' | 'italic';
  size?: number; color?: string;
  lineHeight?: number; letterSpacing?: number;
  transform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
}

export interface CardPhotoFrame {
  x: number; y: number; w: number; h: number;
  fit?: 'cover' | 'contain'; shape?: 'circle' | 'rect'; borderRadius?: number;
}

export interface CardSideFull {
  placement: string;        // 'default' (front print area) | 'back'
  label: string;
  backgroundImage?: string;
  fonts?: { family: string; weight?: number; style?: string; file: string }[];
  photo?: CardPhotoFrame | null;
  fields: CardFieldFull[];
}

export interface CardTemplateFull {
  id: string;
  name: string;
  syncProductId: number;
  variants: CardTemplateVariant[];
  orientation: 'portrait' | 'landscape';
  printFile: CardPrintFile;
  sides: CardSideFull[];
}

export interface PrintfulAdminConfig {
  apiKey: string;
  hasApiKey: boolean;
  storeId: string;
  enabled: boolean;
  textFields: OptionField[];
  templates?: any[];
  fees?: ConvenienceFee[];
}

@Injectable({
  providedIn: 'root'
})
export class BusinessCardsService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // ── Agent Product Browsing ──

  getProducts(): Observable<{ enabled: boolean; products: PrintfulProduct[]; fees?: ConvenienceFee[] }> {
    return this.http.get<{ enabled: boolean; products: PrintfulProduct[]; fees?: ConvenienceFee[] }>(`${this.apiUrl}/business-cards/products`);
  }

  getProductDetail(id: number): Observable<{ product: ProductDetail }> {
    return this.http.get<{ product: ProductDetail }>(`${this.apiUrl}/business-cards/products/${id}`);
  }

  // ── Card Templates (self-hosted render) ──

  getTemplates(): Observable<{ templates: CardTemplate[] }> {
    return this.http.get<{ templates: CardTemplate[] }>(`${this.apiUrl}/business-cards/templates`);
  }

  renderPreview(templateId: string, fieldValues: { [key: string]: string }, photoUrl?: string):
    Observable<{ previews: { placement: string; url: string }[]; previewUrl: string }> {
    return this.http.post<any>(`${this.apiUrl}/business-cards/render-preview`, {
      templateId, fieldValues, photoUrl
    });
  }

  uploadPhoto(file: File): Observable<{ photoUrl: string; message: string }> {
    const form = new FormData();
    form.append('photo', file);
    return this.http.post<any>(`${this.apiUrl}/business-cards/upload-photo`, form);
  }

  uploadTemplateAsset(file: File): Observable<{ url: string; message: string }> {
    const form = new FormData();
    form.append('asset', file);
    return this.http.post<any>(`${this.apiUrl}/business-cards/admin/template-asset`, form);
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
    templateId?: string;
    photoUrl?: string;
  }): Observable<{ orderId: string; clientSecret: string; total: number; subtotal: number; shipping: number; fees?: ConvenienceFee[]; feesTotal?: number }> {
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

  getAdminConfig(): Observable<{ config: PrintfulAdminConfig; warnings?: string[] }> {
    return this.http.get<{ config: PrintfulAdminConfig; warnings?: string[] }>(`${this.apiUrl}/business-cards/admin/config`);
  }

  updateConfig(body: Partial<{ apiKey: string; storeId: string; enabled: boolean; textFields: OptionField[]; templates: any[] }>): Observable<{ message: string; config: PrintfulAdminConfig; warnings?: string[] }> {
    return this.http.post<{ message: string; config: PrintfulAdminConfig; warnings?: string[] }>(`${this.apiUrl}/business-cards/admin/config`, body);
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
