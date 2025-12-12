import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class AgentService {
  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) { }

  private getHeaders() {
    return { headers: this.authService.getAuthHeaders() };
  }

  getProfile(): Observable<any> {
    return this.http.get(`${this.apiUrl}/auth/profile`, this.getHeaders());
  }

  updateProfile(data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/auth/profile`, data, this.getHeaders());
  }

  changePassword(currentPassword: string, newPassword: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/change-password`, 
      { currentPassword, newPassword }, 
      this.getHeaders()
    );
  }

  getRecruits(params?: any): Observable<any> {
    let url = `${this.apiUrl}/agent/recruits`;
    const queryParams = new URLSearchParams();
    
    if (params) {
      if (params.page) queryParams.append('page', params.page.toString());
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.status) queryParams.append('status', params.status);
      if (params.search) queryParams.append('search', params.search);
      if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    }
    
    const queryString = queryParams.toString();
    if (queryString) url += `?${queryString}`;
    
    return this.http.get(url, this.getHeaders());
  }

  getDownline(): Observable<any> {
    return this.http.get(`${this.apiUrl}/agent/downline`, this.getHeaders());
  }

  getStats(): Observable<any> {
    return this.http.get(`${this.apiUrl}/agent/stats`, this.getHeaders());
  }

  getReferralLink(): Observable<any> {
    return this.http.get(`${this.apiUrl}/agent/referral-link`, this.getHeaders());
  }
}
