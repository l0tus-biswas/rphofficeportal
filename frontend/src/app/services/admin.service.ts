import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { User } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) { }

  private getHeaders() {
    return { headers: this.authService.getAuthHeaders() };
  }

  getHierarchy(): Observable<any> {
    return this.http.get(`${this.apiUrl}/admin/hierarchy`, this.getHeaders());
  }

  getUsers(filters?: any): Observable<any> {
    let params = new HttpParams();
    if (filters) {
      Object.keys(filters).forEach(key => {
        if (filters[key]) {
          params = params.set(key, filters[key]);
        }
      });
    }
    return this.http.get(`${this.apiUrl}/admin/users`, { 
      ...this.getHeaders(), 
      params 
    });
  }

  getUserById(userId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/admin/users/${userId}`, this.getHeaders());
  }

  createUser(userData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/admin/users`, userData, this.getHeaders());
  }

  updateUser(userId: string, userData: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/admin/users/${userId}`, userData, this.getHeaders());
  }

  activateUser(userId: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/admin/users/${userId}/activate`, {}, this.getHeaders());
  }

  deactivateUser(userId: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/admin/users/${userId}/deactivate`, {}, this.getHeaders());
  }

  deleteUser(userId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/admin/users/${userId}`, this.getHeaders());
  }

  deleteOnboarding(userId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/admin/onboarding/${userId}`, this.getHeaders());
  }

  getStats(): Observable<any> {
    return this.http.get(`${this.apiUrl}/admin/stats`, this.getHeaders());
  }

  getAuditLogs(page: number = 1, limit: number = 50): Observable<any> {
    return this.http.get(`${this.apiUrl}/admin/audit-logs?page=${page}&limit=${limit}`, this.getHeaders());
  }
}
