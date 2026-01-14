import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class PaymentService {
  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) { }

  private getHeaders() {
    return { headers: this.authService.getAuthHeaders() };
  }

  // Setup fee payment
  createSetupFeePaymentIntent(): Observable<any> {
    return this.http.post(`${this.apiUrl}/payments/one-time-intent`, {}, this.getHeaders());
  }

  // Subscription
  createSubscriptionIntent(): Observable<any> {
    return this.http.post(`${this.apiUrl}/payments/subscription-intent`, {}, this.getHeaders());
  }

  // Get payment status
  getPaymentStatus(): Observable<any> {
    return this.http.get(`${this.apiUrl}/payments/status`, this.getHeaders());
  }

  // User payments history
  getUserPayments(page: number = 1, limit: number = 20): Observable<any> {
    return this.http.get(`${this.apiUrl}/user/payments?page=${page}&limit=${limit}`, this.getHeaders());
  }

  // User subscription
  getUserSubscription(): Observable<any> {
    return this.http.get(`${this.apiUrl}/user/subscription`, this.getHeaders());
  }

  // Admin - Get all payments
  getAllPayments(page: number = 1, limit: number = 50, filters?: any): Observable<any> {
    let url = `${this.apiUrl}/admin/payments?page=${page}&limit=${limit}`;
    if (filters) {
      if (filters.type) url += `&type=${filters.type}`;
      if (filters.status) url += `&status=${filters.status}`;
      if (filters.userId) url += `&userId=${filters.userId}`;
    }
    return this.http.get(url, this.getHeaders());
  }

  // Admin - Get all subscriptions
  getAllSubscriptions(page: number = 1, limit: number = 50, status?: string): Observable<any> {
    let url = `${this.apiUrl}/admin/subscriptions?page=${page}&limit=${limit}`;
    if (status) url += `&status=${status}`;
    return this.http.get(url, this.getHeaders());
  }

  // Admin - Enable payment access
  enablePaymentAccess(userId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/admin/payments/${userId}/enable-access`, {}, this.getHeaders());
  }

  // Admin - Disable payment access
  disablePaymentAccess(userId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/admin/payments/${userId}/disable-access`, {}, this.getHeaders());
  }

  // Admin - Cancel subscription
  cancelSubscription(userId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/admin/subscriptions/${userId}/cancel`, {}, this.getHeaders());
  }

  // Admin - Get payment settings
  getPaymentSettings(): Observable<any> {
    return this.http.get(`${this.apiUrl}/admin/payment-settings`, this.getHeaders());
  }
}
