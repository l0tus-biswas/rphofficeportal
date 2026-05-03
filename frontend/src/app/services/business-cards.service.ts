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

export interface BusinessCardOrder {
  id: number;
  status: string;
  created: string;
  shipping: string;
  costs: any;
  recipient: { name: string; city: string; state: string } | null;
  items: { name: string; quantity: number }[];
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

  /** Get all products from the Printful store */
  getProducts(): Observable<{ enabled: boolean; products: PrintfulProduct[] }> {
    return this.http.get<{ enabled: boolean; products: PrintfulProduct[] }>(`${this.apiUrl}/business-cards/products`);
  }

  /** Get product details with variants and pricing */
  getProductDetail(id: number): Observable<{ product: ProductDetail }> {
    return this.http.get<{ product: ProductDetail }>(`${this.apiUrl}/business-cards/products/${id}`);
  }

  /** Place an order for a product variant */
  placeOrder(variantId: number, quantity: number, shippingAddress: ShippingAddress, textValues?: { [key: string]: string }): Observable<{ message: string; order: any }> {
    const body: any = { variantId, quantity, shippingAddress };
    if (textValues && Object.keys(textValues).length > 0) {
      body.textValues = textValues;
    }
    return this.http.post<{ message: string; order: any }>(`${this.apiUrl}/business-cards/order`, body);
  }

  /** Get agent's order history */
  getOrders(): Observable<{ orders: BusinessCardOrder[] }> {
    return this.http.get<{ orders: BusinessCardOrder[] }>(`${this.apiUrl}/business-cards/orders`);
  }

  // --- Admin Methods ---

  /** Admin: get Printful configuration */
  getAdminConfig(): Observable<{ config: PrintfulAdminConfig }> {
    return this.http.get<{ config: PrintfulAdminConfig }>(`${this.apiUrl}/business-cards/admin/config`);
  }

  /** Admin: update Printful configuration */
  updateConfig(body: Partial<{ apiKey: string; storeId: string; enabled: boolean }>): Observable<{ message: string; config: PrintfulAdminConfig }> {
    return this.http.post<{ message: string; config: PrintfulAdminConfig }>(`${this.apiUrl}/business-cards/admin/config`, body);
  }

  /** Admin: test Printful API connection */
  testConnection(): Observable<{ message: string; store: any }> {
    return this.http.post<{ message: string; store: any }>(`${this.apiUrl}/business-cards/admin/test-connection`, {});
  }
}
