import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, interval, EMPTY } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface Notification {
  _id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  data: any;
  isRead: boolean;
  link?: string;
  emailSent: boolean;
  createdAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private apiUrl = `${environment.apiUrl}/notifications`;
  private unreadCountSubject = new BehaviorSubject<number>(0);
  public unreadCount$ = this.unreadCountSubject.asObservable();

  constructor(private http: HttpClient, private authService: AuthService) {
    // Poll every 30 s only while a user is authenticated.
    // When currentUser$ emits null (logged-out / login page), switchMap to EMPTY
    // so no HTTP requests are made until the user logs back in.
    this.authService.currentUser$.pipe(
      switchMap(user => (user ? interval(30000) : EMPTY))
    ).subscribe(() => {
      this.refreshUnreadCount();
    });

    // Reset badge to 0 whenever the user logs out
    this.authService.currentUser$.subscribe(user => {
      if (!user) {
        this.unreadCountSubject.next(0);
      }
    });
  }

  getNotifications(page: number = 1, limit: number = 20, unreadOnly: boolean = false): Observable<any> {
    return this.http.get(`${this.apiUrl}?page=${page}&limit=${limit}&unreadOnly=${unreadOnly}`);
  }

  getUnreadCount(): Observable<any> {
    return this.http.get(`${this.apiUrl}/unread-count`);
  }

  refreshUnreadCount(): void {
    if (!this.authService.isLoggedIn()) {
      return;
    }
    this.getUnreadCount().subscribe({
      next: (response: any) => {
        const count = response?.count ?? response?.data?.count ?? 0;
        this.unreadCountSubject.next(count);
      },
      error: (error) => {
        console.error('Error fetching unread count:', error);
        this.unreadCountSubject.next(0);
      }
    });
  }

  markAsRead(notificationId: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/${notificationId}/read`, {});
  }

  markAllAsRead(): Observable<any> {
    return this.http.put(`${this.apiUrl}/mark-all-read`, {});
  }

  deleteNotification(notificationId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${notificationId}`);
  }

  deleteAllRead(): Observable<any> {
    return this.http.delete(this.apiUrl);
  }

  // Notification Preferences
  getPreferences(): Observable<any> {
    return this.http.get(`${this.apiUrl}/preferences`);
  }

  updatePreferences(preferences: any, muteAllEmails: boolean): Observable<any> {
    return this.http.put(`${this.apiUrl}/preferences`, { preferences, muteAllEmails });
  }

  // Admin broadcast
  broadcast(title: string, message: string, link?: string, targetRoles?: string[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/broadcast`, { title, message, link, targetRoles });
  }
}
