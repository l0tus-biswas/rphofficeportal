import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CommissionNote {
  _id?: string;
  text: string;
  addedBy?: { _id: string; name: string };
  addedAt?: string;
}

export interface CommissionStatement {
  _id?: string;
  agent?: any;
  carrier: string;
  carriers: string[];
  carrierList: string[];
  payPeriod: string | Date;
  filePath?: string;
  originalFileName?: string;
  uploadedBy?: any;
  uploadedAt?: Date;
  notes: CommissionNote[];
}

@Injectable({
  providedIn: 'root'
})
export class CommissionService {
  private apiUrl = `${environment.apiUrl}/commission-statements`;

  constructor(private http: HttpClient) {}

  // Upload statement (admin) — supports multiple files
  uploadStatement(formData: FormData): Observable<any> {
    return this.http.post(this.apiUrl, formData);
  }

  // Update/edit statement (admin)
  updateStatement(id: string, formData: FormData): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, formData);
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

  // Download a statement PDF (returns blob with auth header)
  downloadStatement(statementId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${statementId}/download`, { responseType: 'blob' });
  }

  // Delete statement (admin)
  deleteStatement(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  // 6.4: Search agents by name
  searchAgents(query: string): Observable<{ agents: any[] }> {
    const params = new HttpParams().set('q', query);
    return this.http.get<{ agents: any[] }>(`${this.apiUrl}/agents/search`, { params });
  }

  // 6.3: Add note to statement
  addNote(statementId: string, text: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${statementId}/notes`, { text });
  }

  // Edit existing note on a statement
  editNote(statementId: string, noteId: string, text: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/${statementId}/notes/${noteId}`, { text });
  }

  // 6.3: Delete note from statement
  deleteNote(statementId: string, noteId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${statementId}/notes/${noteId}`);
  }

  // Get notes for a statement (agent view)
  getNotes(statementId: string): Observable<{ notes: CommissionNote[] }> {
    return this.http.get<{ notes: CommissionNote[] }>(`${this.apiUrl}/${statementId}/notes`);
  }
}
