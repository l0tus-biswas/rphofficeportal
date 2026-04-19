import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ApaService {
  private apiUrl = `${environment.apiUrl}/admin`;

  constructor(private http: HttpClient) { }

  getApplications(params?: any): Observable<any> {
    let httpParams = new HttpParams();
    
    if (params) {
      Object.keys(params).forEach(key => {
        if (params[key]) {
          httpParams = httpParams.set(key, params[key]);
        }
      });
    }
    
    return this.http.get(`${this.apiUrl}/apa-applications`, { params: httpParams });
  }

  getApplication(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/apa-applications/${id}`);
  }

  approveApplication(id: string, adminNotes?: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/apa-applications/${id}/approve`, { adminNotes });
  }

  rejectApplication(id: string, reason: string, adminNotes?: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/apa-applications/${id}/reject`, { reason, adminNotes });
  }

  updateNotes(id: string, adminNotes: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/apa-applications/${id}/notes`, { adminNotes });
  }

  resendDocuSign(id: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/public/apa-application/${id}/resend-docusign`, {});
  }

  getStats(): Observable<any> {
    return this.http.get(`${this.apiUrl}/apa-applications/stats/overview`);
  }

  getAutoApproveSetting(): Observable<any> {
    return this.http.get(`${this.apiUrl}/apa-applications/settings/auto-approve`);
  }

  setAutoApproveSetting(enabled: boolean): Observable<any> {
    return this.http.put(`${this.apiUrl}/apa-applications/settings/auto-approve`, { enabled });
  }
}
