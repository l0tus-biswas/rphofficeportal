import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Carrier {
  _id?: string;
  name: string;
  isActive: boolean;
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

@Injectable({
  providedIn: 'root'
})
export class CarrierService {
  private apiUrl = `${environment.apiUrl}/carriers`;

  constructor(private http: HttpClient) {}

  // Get all carriers
  getAllCarriers(activeOnly: boolean = true): Observable<Carrier[]> {
    let params = new HttpParams();
    if (activeOnly) params = params.set('activeOnly', 'true');
    
    return this.http.get<Carrier[]>(this.apiUrl, { params });
  }

  // Get specific carrier
  getCarrier(id: string): Observable<Carrier> {
    return this.http.get<Carrier>(`${this.apiUrl}/${id}`);
  }

  // Create carrier (admin only)
  createCarrier(data: Partial<Carrier>): Observable<Carrier> {
    return this.http.post<Carrier>(this.apiUrl, data);
  }

  // Update carrier (admin only)
  updateCarrier(id: string, data: Partial<Carrier>): Observable<Carrier> {
    return this.http.put<Carrier>(`${this.apiUrl}/${id}`, data);
  }

  // Delete carrier (soft delete - mark inactive) (admin only)
  deleteCarrier(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}
