import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, interval } from 'rxjs';
import { environment } from '../../environments/environment';

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

  constructor(private http: HttpClient) {
    // Poll for unread count every 30 seconds
    interval(30000).subscribe(() => {
      this.refreshUnreadCount();
    });
  }

  getNotifications(page: number = 1, limit: number = 20, unreadOnly: boolean = false): Observable<any> {
    return this.http.get(`${this.apiUrl}?page=${page}&limit=${limit}&unreadOnly=${unreadOnly}`);
  }

  getUnreadCount(): Observable<any> {
    return this.http.get(`${this.apiUrl}/unread-count`);
  }

  refreshUnreadCount(): void {
    this.getUnreadCount().subscribe({
      next: (response: any) => {
        const count = response?.data?.count ?? 0;
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
}
