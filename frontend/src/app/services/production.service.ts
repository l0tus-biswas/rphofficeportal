import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ProductionSubmission {
  _id?: string;
  agent: any;
  submissionDate: Date;
  clientName: string;
  productSold: string;
  productOtherDescription?: string;
  carrier: any;
  premiumAmount: number;
  notes?: string;
  status: 'submitted' | 'pending' | 'approved' | 'rejected' | 'paid';
  reviewedBy?: any;
  reviewedAt?: Date;
  reviewNotes?: string;
  documents?: Document[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ProductionFilters {
  agentId?: string;
  productSold?: string;
  carrier?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface ProductionResponse {
  submissions: ProductionSubmission[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface ProductionStats {
  summary: {
    totalSubmissions: number;
    totalPremium: number;
    avgPremium: number;
  };
  byProduct: {
    _id: string;
    count: number;
    totalPremium: number;
  }[];
}

export const PRODUCT_TYPES = [
  'Accident Insurance',
  'Cancer Insurance',
  'Critical Illness',
  'Dental / Vision / Hearing',
  'Disability',
  'Final Expense',
  'Hospital Indemnity',
  'Life Insurance – Term',
  'Life Insurance – IUL',
  'Life Insurance – Whole Life',
  'Life Insurance – VUL',
  'Long Term Care',
  'Medicare Advantage',
  'Other'
];

@Injectable({
  providedIn: 'root'
})
export class ProductionService {
  private apiUrl = `${environment.apiUrl}/production`;

  constructor(private http: HttpClient) {}

  // Get production submissions with filtering
  getProductionSubmissions(filters?: ProductionFilters): Observable<ProductionResponse> {
    let params = new HttpParams();
    if (filters?.agentId) params = params.set('agentId', filters.agentId);
    if (filters?.productSold) params = params.set('productSold', filters.productSold);
    if (filters?.carrier) params = params.set('carrier', filters.carrier);
    if (filters?.status) params = params.set('status', filters.status);
    if (filters?.startDate) params = params.set('startDate', filters.startDate);
    if (filters?.endDate) params = params.set('endDate', filters.endDate);
    if (filters?.page) params = params.set('page', filters.page.toString());
    if (filters?.limit) params = params.set('limit', filters.limit.toString());
    
    return this.http.get<ProductionResponse>(this.apiUrl, { params });
  }

  // Get specific production submission
  getProductionSubmission(id: string): Observable<ProductionSubmission> {
    return this.http.get<ProductionSubmission>(`${this.apiUrl}/${id}`);
  }

  // Create new production submission
  createProductionSubmission(data: Partial<ProductionSubmission>): Observable<ProductionSubmission> {
    return this.http.post<ProductionSubmission>(this.apiUrl, data);
  }

  // Update production submission
  updateProductionSubmission(id: string, data: Partial<ProductionSubmission>): Observable<ProductionSubmission> {
    return this.http.put<ProductionSubmission>(`${this.apiUrl}/${id}`, data);
  }

  // Delete production submission
  deleteProductionSubmission(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  // Upload document
  uploadDocument(id: string, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('document', file);
    
    return this.http.post(`${this.apiUrl}/${id}/upload`, formData);
  }

  // Admin review
  reviewSubmission(id: string, status: string, reviewNotes?: string): Observable<ProductionSubmission> {
    return this.http.put<ProductionSubmission>(`${this.apiUrl}/${id}/review`, {
      status,
      reviewNotes
    });
  }

  // Get statistics summary
  getProductionStats(filters?: { agentId?: string; startDate?: string; endDate?: string }): Observable<ProductionStats> {
    let params = new HttpParams();
    if (filters?.agentId) params = params.set('agentId', filters.agentId);
    if (filters?.startDate) params = params.set('startDate', filters.startDate);
    if (filters?.endDate) params = params.set('endDate', filters.endDate);
    
    return this.http.get<ProductionStats>(`${this.apiUrl}/stats/summary`, { params });
  }
}
