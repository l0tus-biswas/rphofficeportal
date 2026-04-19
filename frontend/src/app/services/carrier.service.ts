import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ProductFactor {
  productName: string;
  factor: number | null;
  level?: string;
}

export interface Carrier {
  _id?: string;
  name: string;
  category: string;
  isActive: boolean;
  factor?: number | null;
  productFactors?: ProductFactor[];
  contractingLink?: string;
  contractingInstructions?: string;
  whatToExpect?: string;
  supplementalLevelGuide?: string;
  contactInfo?: {
    phone?: string;
    email?: string;
    website?: string;
  };
  notes?: string;
  addedBy?: any;
  lastModifiedBy?: any;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AgentCarrierStatus {
  _id?: string;
  agent?: any;
  carrier: any;
  status: 'Requested' | 'Appointed' | 'Unappointed';
  requestedAt?: Date;
  appointedAt?: Date;
  appointedBy?: any;
  unappointedAt?: Date;
  unappointedBy?: any;
  notes?: { text: string; addedBy: any; addedAt: Date }[];
}

@Injectable({
  providedIn: 'root'
})
export class CarrierService {
  private apiUrl = `${environment.apiUrl}/carriers`;

  constructor(private http: HttpClient) {}

  // Get all carriers (admin: includes inactive; agents: active only)
  getAllCarriers(activeOnly: boolean = true): Observable<Carrier[]> {
    let params = new HttpParams();
    if (activeOnly) params = params.set('activeOnly', 'true');
    return this.http.get<Carrier[]>(this.apiUrl, { params });
  }

  // Get carriers filtered by category
  getCarriersByCategory(category: string): Observable<Carrier[]> {
    let params = new HttpParams().set('category', category);
    return this.http.get<Carrier[]>(this.apiUrl, { params });
  }

  // Get specific carrier
  getCarrier(id: string): Observable<Carrier> {
    return this.http.get<Carrier>(`${this.apiUrl}/${id}`);
  }

  // Create carrier (admin only) — supports FormData for PDF upload
  createCarrier(data: FormData | Partial<Carrier>): Observable<Carrier> {
    return this.http.post<Carrier>(this.apiUrl, data);
  }

  // Update carrier (admin only) — supports FormData for PDF upload
  updateCarrier(id: string, data: FormData | Partial<Carrier>): Observable<Carrier> {
    return this.http.put<Carrier>(`${this.apiUrl}/${id}`, data);
  }

  // Delete carrier (soft delete - mark inactive) (admin only)
  deleteCarrier(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  // -----------------------------------------------------------------------
  // Carrier Status (TASK 012)
  // -----------------------------------------------------------------------

  // Agent: get all their carrier status records
  getMyCarrierStatuses(): Observable<AgentCarrierStatus[]> {
    return this.http.get<AgentCarrierStatus[]>(`${this.apiUrl}/my-statuses`);
  }

  // Agent: request a contract with a carrier
  requestContract(carrierId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${carrierId}/request`, {});
  }

  // Admin: list all pending/all requests
  getAllCarrierRequests(statusFilter?: string): Observable<AgentCarrierStatus[]> {
    let params = new HttpParams();
    if (statusFilter) params = params.set('status', statusFilter);
    return this.http.get<AgentCarrierStatus[]>(`${this.apiUrl}/admin/all-requests`, { params });
  }

  // Admin: appoint agent for a carrier
  appointCarrier(statusId: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/admin/status/${statusId}/appoint`, {});
  }

  // Admin: unappoint agent from a carrier
  unappointCarrier(statusId: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/admin/status/${statusId}/unappoint`, {});
  }

  // Admin: add note to a carrier request
  addNote(statusId: string, text: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/admin/status/${statusId}/notes`, { text });
  }
}

