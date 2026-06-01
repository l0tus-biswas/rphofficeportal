import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, interval, EMPTY } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { SocketService } from './socket.service';

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
  
  private newBroadcastSubject = new BehaviorSubject<Broadcast | null>(null);
  public newBroadcast$ = this.newBroadcastSubject.asObservable();

  // localStorage key for broadcasts the user has explicitly dismissed/confirmed
  private readonly DISMISSED_KEY = 'rph_broadcast_dismissed_ids';
  // in-memory guard: prevents showing the same popup twice in one session
  private shownInSession = new Set<string>();

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private socketService: SocketService
  ) {
    // Poll unread broadcast count every 60s while logged in
    this.authService.currentUser$.pipe(
      switchMap(user => (user ? interval(60000) : EMPTY))
    ).subscribe(() => {
      this.refreshUnreadCount();
    });

    // Listen for real-time broadcasts via WebSocket
    this.setupSocketListeners();

    // When user logs in, check for any unread broadcasts they missed while offline
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.checkOfflineBroadcasts();
      } else {
        this.unreadCountSubject.next(0);
      }
    });

    // Also check on every socket reconnect (handles network drops)
    this.socketService.connectionState$.subscribe(state => {
      if (state === 'connected') {
        this.checkOfflineBroadcasts();
      }
    });
  }

  /**
   * Fetch unread broadcasts the user may have missed while offline and show
   * a popup for the most recent one not already shown.
   */
  private checkOfflineBroadcasts(): void {
    if (!this.authService.isLoggedIn()) return;
    this.getBroadcasts(1, 20).subscribe({
      next: (res: any) => {
        const broadcasts: Broadcast[] = res?.broadcasts || res?.data?.broadcasts || [];
        // Client-side safety: skip broadcasts that predate the user's account
        const user = this.authService.getCurrentUser();
        const userCreatedAt = user?.createdAt ? new Date(user.createdAt).getTime() : Date.now();
        const eligible = broadcasts.filter(b => new Date(b.createdAt).getTime() >= userCreatedAt);
        // Find the newest unread broadcast we haven't popped up yet
        const toShow = eligible.find(b => !b.isRead && !this.isBroadcastDismissed(b._id));
        if (toShow) {
          this.emitForPopup(toShow);
        }
      },
      error: () => {}
    });
  }

  /** Emit a broadcast to the popup subject.
   *  - Skips if user already dismissed/confirmed this broadcast (localStorage).
   *  - Skips if already shown in this browser session (in-memory guard).
   *  - Does NOT mark dismissed here; that only happens when user acts. */
  private emitForPopup(broadcast: Broadcast): void {
    if (this.isBroadcastDismissed(broadcast._id)) return;
    if (this.shownInSession.has(broadcast._id)) return;
    this.shownInSession.add(broadcast._id);
    this.newBroadcastSubject.next(broadcast);
  }

  /** Called by the popup component when user explicitly dismisses, confirms, or opens the link. */
  public markBroadcastDismissed(id: string): void {
    this.shownInSession.delete(id);
    const dismissed = this.getDismissedIds();
    dismissed.add(id);
    const trimmed = Array.from(dismissed).slice(-100);
    try { localStorage.setItem(this.DISMISSED_KEY, JSON.stringify(trimmed)); } catch {}
  }

  private isBroadcastDismissed(id: string): boolean {
    return this.getDismissedIds().has(id);
  }

  private getDismissedIds(): Set<string> {
    try {
      const raw = localStorage.getItem(this.DISMISSED_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  }

  /**
   * Setup Socket.IO listeners for real-time broadcast notifications
   */
  private setupSocketListeners(): void {
    this.socketService.on<Broadcast>('new_broadcast').subscribe({
      next: (broadcast: Broadcast) => {
        // Skip broadcasts created before the user's account
        const user = this.authService.getCurrentUser();
        if (user?.createdAt && broadcast.createdAt) {
          const userDate = new Date(user.createdAt).getTime();
          const broadcastDate = new Date(broadcast.createdAt).getTime();
          if (broadcastDate < userDate) {
            console.log('[Broadcast] Skipping old broadcast (pre-dates user):', broadcast.title);
            return;
          }
        }
        console.log('[Broadcast] New broadcast received via WebSocket:', broadcast.title);
        this.emitForPopup(broadcast);
        this.refreshUnreadCount();
      },
      error: (err) => {
        console.error('[Broadcast] Socket listener error:', err);
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

  // Admin: trigger socket notification after broadcast is fully ready (incl. image)
  notifyBroadcast(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/notify`, {}, this.getHeaders());
  }
}
