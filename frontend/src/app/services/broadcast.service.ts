import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, interval, EMPTY } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface Broadcast {
  _id: string;
  title: string;
  message: string;
  link?: string;
  image?: string;
  targetRoles: string[];
  sentCount: number;
  emailsSent: number;
  isActive: boolean;
  createdBy: { _id: string; name: string } | string;
  createdAt: string;
  updatedAt: string;
  isRead?: boolean;
  postedBy?: string;
}

@Injectable({
  providedIn: 'root'
})
export class BroadcastService {
  private apiUrl = `${environment.apiUrl}/broadcasts`;
  private unreadCountSubject = new BehaviorSubject<number>(0);
  public unreadCount$ = this.unreadCountSubject.asObservable();

  constructor(private http: HttpClient, private authService: AuthService) {
    // Poll unread broadcast count every 30s while logged in
    this.authService.currentUser$.pipe(
      switchMap(user => (user ? interval(30000) : EMPTY))
    ).subscribe(() => {
      this.refreshUnreadCount();
    });

    this.authService.currentUser$.subscribe(user => {
      if (!user) {
        this.unreadCountSubject.next(0);
      }
    });
  }

  refreshUnreadCount(): void {
    if (!this.authService.isLoggedIn()) return;
    this.http.get(`${this.apiUrl}/unread-count`, this.getHeaders()).subscribe({
      next: (res: any) => {
        const count = res?.unreadCount ?? res?.data?.unreadCount ?? 0;
        this.unreadCountSubject.next(count);
      },
      error: () => this.unreadCountSubject.next(0)
    });
  }

  private getHeaders() {
    return {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authService.getToken()}`
      })
    };
  }

  // Agent + Admin: list active broadcasts
  getBroadcasts(page = 1, limit = 20): Observable<any> {
    return this.http.get(`${this.apiUrl}?page=${page}&limit=${limit}`, this.getHeaders());
  }

  // Agent + Admin: get single broadcast (marks as read)
  getBroadcast(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`, this.getHeaders());
  }

  // Admin: get all broadcasts including inactive
  getAdminBroadcasts(page = 1, limit = 20): Observable<any> {
    return this.http.get(`${this.apiUrl}/admin/all?page=${page}&limit=${limit}`, this.getHeaders());
  }

  // Admin: create and send broadcast
  createBroadcast(data: { title: string; message: string; link?: string; targetRoles?: string[] }): Observable<any> {
    return this.http.post(this.apiUrl, data, this.getHeaders());
  }

  // Admin: update broadcast
  updateBroadcast(id: string, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, data, this.getHeaders());
  }

  // Admin: delete broadcast
  deleteBroadcast(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`, this.getHeaders());
  }

  // Admin: resend to new users
  resendBroadcast(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/resend`, {}, this.getHeaders());
  }

  // Admin: upload broadcast image
  uploadBroadcastImage(id: string, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('image', file);
    const headers = new HttpHeaders({ 'Authorization': `Bearer ${this.authService.getToken()}` });
    return this.http.post(`${this.apiUrl}/${id}/image`, formData, { headers });
  }

  // Admin: remove broadcast image
  removeBroadcastImage(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}/image`, this.getHeaders());
  }
}
