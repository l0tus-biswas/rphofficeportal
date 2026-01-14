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

  validateReferralCode(code: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/public/verify-referral/${code}`);
  }

  createRegistrationPaymentIntent(email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/public/registration-payment-intent`, { email });
  }

  forgotPassword(email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/forgot-password`, { email });
  }

  resetPassword(token: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/reset-password/${token}`, { password });
  }

  submitAPAApplication(applicationData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/public/apa-application`, applicationData);
  }

  getAPAApplicationStatus(applicationId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/public/apa-application/${applicationId}`);
  }

  uploadComplianceDocument(applicationId: string, questionKey: string, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('document', file);
    formData.append('questionKey', questionKey);
    return this.http.post(`${this.apiUrl}/public/apa-application/${applicationId}/compliance-document`, formData);
  }

  completeSignature(applicationId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/public/apa-application/${applicationId}/complete-signature`, {});
  }

  completePayment(applicationId: string, paymentData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/public/apa-application/${applicationId}/complete-payment`, paymentData);
  }

  createCheckoutSession(applicationId: string, couponCode?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/public/apa-application/create-checkout-session`, {
      applicationId,
      couponCode
    });
  }

  verifyPayment(sessionId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/public/apa-application/verify-payment`, {
      sessionId
    });
  }

  resendDocuSign(applicationId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/public/apa-application/${applicationId}/resend-docusign`, {});
  }

  checkPendingApplication(email: string, referralCode: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/public/check-pending-application?email=${email}&ref=${referralCode}`);
  }
}
