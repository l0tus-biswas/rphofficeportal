import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CommissionStatement {
  _id?: string;
  agent?: any;
  carrier: string;
  payPeriod: string | Date;
  filePath?: string;
  originalFileName?: string;
  uploadedBy?: any;
  uploadedAt?: Date;
}

@Injectable({
  providedIn: 'root'
})
export class CommissionService {
  private apiUrl = `${environment.apiUrl}/commission-statements`;

  constructor(private http: HttpClient) {}

  // Upload statement (admin)
  uploadStatement(formData: FormData): Observable<any> {
    return this.http.post(this.apiUrl, formData);
  }

  // List statements (agent sees own; admin sees all)
  getStatements(filters?: { agentId?: string; carrier?: string; from?: string; to?: string }): Observable<CommissionStatement[]> {
    let params = new HttpParams();
    if (filters?.agentId) params = params.set('agentId', filters.agentId);
    if (filters?.carrier) params = params.set('carrier', filters.carrier);
    if (filters?.from) params = params.set('from', filters.from);
    if (filters?.to) params = params.set('to', filters.to);
    return this.http.get<CommissionStatement[]>(this.apiUrl, { params });
  }

  // Get download URL for a statement
  getDownloadUrl(statementId: string): string {
    return `${this.apiUrl}/${statementId}/download`;
  }

  // Delete statement (admin)
  deleteStatement(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}
