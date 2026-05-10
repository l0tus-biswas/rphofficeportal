import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ProductionSubmission {
  _id?: string;
  agent: any;
  submissionDate: Date;
  clientName: string;
  numberOfMembers?: number | null;
  productSold: string;
  productOtherDescription?: string;
  productCategory?: 'Life Insurance' | 'Health Insurance' | 'Medicare' | 'Supplemental Insurance' | 'Retirement / Annuities' | 'Property & Casualty - Personal' | 'Property & Casualty - Commercial';
  carrier: any;
  premiumAmount: number;
  notes?: string;
  status: 'Submitted' | 'Pending' | 'In Force' | 'Lapsed' | 'Cancelled';
  isTrainingPeriod?: boolean;
  customFields?: Record<string, any>;
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
  scope?: string;
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

export interface RankingEntry {
  rank: number;
  agentId: string;
  agentName: string;
  agentEmail: string;
  totalPremium: number;
  totalPolicies: number;
  totalMembers: number;
  inForceCount: number;
  inForcePremium: number;
}

export interface CustomFieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'date' | 'checkbox';
  options?: string[];
  required?: boolean;
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
  // Life Insurance
  'Term Life Insurance',
  'Whole Life Insurance',
  'Universal Life (UL)',
  'Indexed Universal Life (IUL)',
  'Final Expense / Burial Insurance',
  // Supplemental Insurance
  'Accident Insurance',
  'Cancer Insurance',
  'Critical Illness Insurance',
  'Dental Insurance',
  'Vision Insurance',
  'Hospital Indemnity',
  'Short-Term Disability Insurance',
  'Long-Term Disability Insurance',
  'Long-Term Care Insurance',
  // Medicare
  'Medicare Advantage',
  'Medicare Supplement (Medigap)',
  'Medicare Part D (Prescription Drug Plan)',
  // Health Insurance
  'ACA Marketplace Health Insurance',
  'Private Health Insurance',
  'Short-Term Health Insurance',
  // Retirement / Annuities
  'Fixed Annuities',
  'Indexed Annuities',
  // Property & Casualty - Personal
  'Auto Insurance',
  'Homeowners Insurance',
  'Renters Insurance',
  'Landlord Insurance',
  'Motorcycle Insurance',
  'RV Insurance',
  'Boat / Watercraft Insurance',
  'Umbrella Insurance',
  // Property & Casualty - Commercial
  'General Liability Insurance',
  "Workers' Compensation Insurance",
  'Commercial Property Insurance',
  'Commercial Auto Insurance',
  "Business Owner's Policy (BOP)",
  'Professional Liability Insurance',
  // Other
  'Other'
];

export const STATUS_VALUES: Array<'Submitted' | 'Pending' | 'In Force' | 'Lapsed' | 'Cancelled'> = [
  'Submitted',
  'Pending',
  'In Force',
  'Lapsed',
  'Cancelled'
];

export type ProductCategory =
  | 'Life Insurance'
  | 'Health Insurance'
  | 'Medicare'
  | 'Supplemental Insurance'
  | 'Retirement / Annuities'
  | 'Property & Casualty - Personal'
  | 'Property & Casualty - Commercial';

export const PRODUCT_CATEGORY_MAP: Record<string, ProductCategory> = {
  // Medicare
  'Medicare Advantage':                    'Medicare',
  'Medicare Supplement (Medigap)':         'Medicare',
  'Medicare Part D (Prescription Drug Plan)': 'Medicare',
  // Health Insurance
  'ACA Marketplace Health Insurance':      'Health Insurance',
  'Private Health Insurance':              'Health Insurance',
  'Short-Term Health Insurance':           'Health Insurance',
  // Life Insurance
  'Term Life Insurance':                   'Life Insurance',
  'Whole Life Insurance':                  'Life Insurance',
  'Universal Life (UL)':                   'Life Insurance',
  'Indexed Universal Life (IUL)':          'Life Insurance',
  'Final Expense / Burial Insurance':      'Life Insurance',
  // Legacy names
  'Life Insurance \u2013 Term':            'Life Insurance',
  'Life Insurance \u2013 IUL':             'Life Insurance',
  'Life Insurance \u2013 Whole Life':      'Life Insurance',
  'Life Insurance \u2013 VUL':             'Life Insurance',
  'Final Expense':                         'Life Insurance',
  // Supplemental Insurance
  'Accident Insurance':                    'Supplemental Insurance',
  'Cancer Insurance':                      'Supplemental Insurance',
  'Critical Illness Insurance':            'Supplemental Insurance',
  'Dental Insurance':                      'Supplemental Insurance',
  'Vision Insurance':                      'Supplemental Insurance',
  'Hospital Indemnity':                    'Supplemental Insurance',
  'Short-Term Disability Insurance':       'Supplemental Insurance',
  'Long-Term Disability Insurance':        'Supplemental Insurance',
  'Long-Term Care Insurance':              'Supplemental Insurance',
  // Legacy names
  'Critical Illness':                      'Supplemental Insurance',
  'Dental / Vision / Hearing':             'Supplemental Insurance',
  'Disability':                            'Supplemental Insurance',
  'Long Term Care':                        'Supplemental Insurance',
  // Retirement / Annuities
  'Fixed Annuities':                       'Retirement / Annuities',
  'Indexed Annuities':                     'Retirement / Annuities',
  // Property & Casualty - Personal
  'Auto Insurance':                        'Property & Casualty - Personal',
  'Homeowners Insurance':                  'Property & Casualty - Personal',
  'Renters Insurance':                     'Property & Casualty - Personal',
  'Landlord Insurance':                    'Property & Casualty - Personal',
  'Motorcycle Insurance':                  'Property & Casualty - Personal',
  'RV Insurance':                          'Property & Casualty - Personal',
  'Boat / Watercraft Insurance':           'Property & Casualty - Personal',
  'Umbrella Insurance':                    'Property & Casualty - Personal',
  // Property & Casualty - Commercial
  'General Liability Insurance':           'Property & Casualty - Commercial',
  "Workers' Compensation Insurance":       'Property & Casualty - Commercial',
  'Commercial Property Insurance':         'Property & Casualty - Commercial',
  'Commercial Auto Insurance':             'Property & Casualty - Commercial',
  "Business Owner's Policy (BOP)":         'Property & Casualty - Commercial',
  'Professional Liability Insurance':      'Property & Casualty - Commercial',
  // Other defaults to Life Insurance
  'Other':                                 'Life Insurance',
};

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

  // Export production data as CSV blob
  exportProductionCsv(filters?: ProductionFilters): Observable<Blob> {
    let params = new HttpParams();
    if (filters?.agentId) params = params.set('agentId', filters.agentId);
    if (filters?.productSold) params = params.set('productSold', filters.productSold);
    if (filters?.carrier) params = params.set('carrier', filters.carrier);
    if (filters?.status) params = params.set('status', filters.status);
    if (filters?.startDate) params = params.set('startDate', filters.startDate);
    if (filters?.endDate) params = params.set('endDate', filters.endDate);

    return this.http.get(`${this.apiUrl}/export`, { params, responseType: 'blob' });
  }

  // 8.3: Get team-scoped production submissions
  getTeamSubmissions(filters?: ProductionFilters): Observable<ProductionResponse> {
    let params = new HttpParams().set('scope', 'team');
    if (filters?.startDate) params = params.set('startDate', filters.startDate);
    if (filters?.endDate) params = params.set('endDate', filters.endDate);
    if (filters?.productSold) params = params.set('productSold', filters.productSold);
    if (filters?.status) params = params.set('status', filters.status);
    if (filters?.page) params = params.set('page', filters.page.toString());
    if (filters?.limit) params = params.set('limit', filters.limit.toString());
    return this.http.get<ProductionResponse>(this.apiUrl, { params });
  }

  // 8.7: Get agent ranking/leaderboard
  getRanking(sortBy?: string, windowDays?: number, limit?: number): Observable<{ ranking: RankingEntry[]; sortBy: string; windowDays: number }> {
    let params = new HttpParams();
    if (sortBy) params = params.set('sortBy', sortBy);
    if (windowDays) params = params.set('window', windowDays.toString());
    if (limit) params = params.set('limit', limit.toString());
    return this.http.get<any>(`${this.apiUrl}/ranking`, { params });
  }

  // 8.2: Get custom field definitions
  getCustomFields(): Observable<{ fields: CustomFieldDef[] }> {
    return this.http.get<{ fields: CustomFieldDef[] }>(`${this.apiUrl}/custom-fields`);
  }

  // 8.2: Save custom field definitions (admin)
  saveCustomFields(fields: CustomFieldDef[]): Observable<any> {
    return this.http.put(`${this.apiUrl}/custom-fields`, { fields });
  }
}
