import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Onboarding } from '../models/onboarding.model';

@Injectable({
  providedIn: 'root'
})
export class OnboardingService {
  private apiUrl = `${environment.apiUrl}/onboarding`;

  constructor(private http: HttpClient) { }

  // Agent/User endpoints
  getMyOnboarding(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/me`);
  }

  uploadMyDocuments(files: FormData): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/me/upload`, files);
  }

  downloadMyDocument(step: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/me/files/${step}`, {
      responseType: 'blob'
    });
  }

  // Admin endpoints
  getAllOnboardings(page: number = 1, limit: number = 20, status?: string, search?: string, userId?: string): Observable<any> {
    let params: any = { page: page.toString(), limit: limit.toString() };
    if (status) params.status = status;
    if (search) params.search = search;
    if (userId) params.userId = userId;

    return this.http.get<any>(this.apiUrl, { params });
  }

  getUserOnboarding(userId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/users/${userId}`);
  }

  downloadUserDocument(userId: string, step: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/users/${userId}/files/${step}`, {
      responseType: 'blob'
    });
  }

  uploadForUser(userId: string, files: FormData): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/users/${userId}/upload`, files);
  }

  updateStepStatus(userId: string, step: string, status: string, comment?: string): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/users/${userId}/steps/${step}/status`, {
      status,
      comment
    });
  }

  addNote(userId: string, message: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/users/${userId}/notes`, { message });
  }

  // Helper to download file
  downloadFile(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  // Get status badge class
  getStatusClass(status: string): string {
    switch (status) {
      case 'approved':
        return 'badge bg-success';
      case 'rejected':
        return 'badge bg-danger';
      case 'missing':
        return 'badge bg-warning text-dark';
      case 'pending':
        return 'badge bg-info';
      case 'not-started':
        return 'badge bg-secondary';
      default:
        return 'badge bg-secondary';
    }
  }

  // Get status icon
  getStatusIcon(status: string): string {
    switch (status) {
      case 'approved':
        return 'bi-check-circle-fill';
      case 'rejected':
        return 'bi-x-circle-fill';
      case 'missing':
        return 'bi-exclamation-triangle-fill';
      case 'pending':
        return 'bi-clock-fill';
      case 'not-started':
        return 'bi-circle';
      default:
        return 'bi-circle';
    }
  }
}
