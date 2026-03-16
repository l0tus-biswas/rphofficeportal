import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ProductType {
  _id?: string;
  name: string;
  category: 'Life Insurance' | 'Health Insurance' | 'Medicare' | 'Supplemental Insurance' | 'Retirement / Annuities' | 'Property & Casualty - Personal' | 'Property & Casualty - Commercial';
  isActive?: boolean;
  addedBy?: any;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ProductCategory =
  | 'Life Insurance'
  | 'Health Insurance'
  | 'Medicare'
  | 'Supplemental Insurance'
  | 'Retirement / Annuities'
  | 'Property & Casualty - Personal'
  | 'Property & Casualty - Commercial';

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  'Life Insurance',
  'Health Insurance',
  'Medicare',
  'Supplemental Insurance',
  'Retirement / Annuities',
  'Property & Casualty - Personal',
  'Property & Casualty - Commercial'
];

@Injectable({
  providedIn: 'root'
})
export class ProductTypeService {
  private apiUrl = `${environment.apiUrl}/admin/products`;

  constructor(private http: HttpClient) {}

  getProducts(activeOnly?: boolean): Observable<{ products: ProductType[] }> {
    let params = new HttpParams();
    if (activeOnly) params = params.set('activeOnly', 'true');
    return this.http.get<{ products: ProductType[] }>(this.apiUrl, { params });
  }

  createProduct(data: Partial<ProductType>): Observable<{ product: ProductType; message: string }> {
    return this.http.post<{ product: ProductType; message: string }>(this.apiUrl, data);
  }

  updateProduct(id: string, data: Partial<ProductType>): Observable<{ product: ProductType; message: string }> {
    return this.http.put<{ product: ProductType; message: string }>(`${this.apiUrl}/${id}`, data);
  }

  deactivateProduct(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }
}
