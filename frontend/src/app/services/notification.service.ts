import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { SocketService } from './socket.service';

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

  // Emits each new notification pushed over the socket (for live list updates).
  private newNotificationSubject = new BehaviorSubject<Notification | null>(null);
  public newNotification$ = this.newNotificationSubject.asObservable();

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private socketService: SocketService
  ) {
    // Real-time: a new notification arriving over the WebSocket refreshes the
    // badge instantly — no periodic polling needed.
    this.socketService.on<Notification>('notification:new').subscribe({
      next: (notification) => {
        this.newNotificationSubject.next(notification);
        this.refreshUnreadCount();
      },
      error: (err) => console.error('[Notification] Socket listener error:', err)
    });

    // Resync the count after every (re)connect to catch anything missed while
    // the socket was down, and do the initial fetch once connected.
    this.socketService.connectionState$.subscribe(state => {
      if (state === 'connected') {
        this.refreshUnreadCount();
      }
    });

    // Reset badge to 0 whenever the user logs out; fetch once on login so the
    // badge is correct even before the socket finishes connecting.
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.refreshUnreadCount();
      } else {
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
