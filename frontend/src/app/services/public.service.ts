import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApplyFormData } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class PublicService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getAgentInfo(referralCode: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/public/apply?ref=${referralCode}`);
  }

  submitApplication(formData: ApplyFormData, referralCode?: string): Observable<any> {
    const url = referralCode 
      ? `${this.apiUrl}/public/apply?ref=${referralCode}`
      : `${this.apiUrl}/public/apply`;
    return this.http.post(url, formData);
  }

  verifyReferralCode(code: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/public/verify-referral/${code}`);
  }

  forgotPassword(email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/forgot-password`, { email });
  }

  resetPassword(token: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/reset-password/${token}`, { password });
  }
}
