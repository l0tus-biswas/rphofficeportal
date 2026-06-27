import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { User, LoginRequest, LoginResponse } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  public currentUser = this.currentUserSubject.asObservable();

  // Impersonation state — true when an admin is logged in as another user
  private impersonatingSubject = new BehaviorSubject<boolean>(
    localStorage.getItem('impersonating') === 'true'
  );
  public isImpersonating$ = this.impersonatingSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadCurrentUser();
  }

  private loadCurrentUser(): void {
    const token = this.getToken();
    const userStr = localStorage.getItem('user');
    
    if (token && userStr) {
      // Load user from localStorage immediately
      try {
        const user = JSON.parse(userStr);
        this.currentUserSubject.next(user);
      } catch (e) {
        console.error('Failed to parse user from localStorage', e);
      }
      
      // Then validate token with backend
      this.getMe().subscribe({
        next: (response: any) => {
          // Update with fresh data from server
          localStorage.setItem('user', JSON.stringify(response.user));
          this.currentUserSubject.next(response.user);
        },
        error: (error) => {
          // Only logout if token is actually invalid (401)
          if (error.status === 401) {
            this.logout();
          }
          // For other errors (network issues, 500, etc.), keep the user logged in
        }
      });
    }
  }

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/auth/login`, credentials)
      .pipe(
        tap(response => {
          if (response.success && response.token) {
            localStorage.setItem('token', response.token);
            localStorage.setItem('user', JSON.stringify(response.user));
            this.currentUserSubject.next(response.user);
          }
        })
      );
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    localStorage.removeItem('impersonating');
    this.impersonatingSubject.next(false);
    this.currentUserSubject.next(null);
  }

  isImpersonating(): boolean {
    return this.impersonatingSubject.value;
  }

  // Admin starts impersonating another user. Saves the admin's own session so it
  // can be restored, then swaps the active session to the target user.
  impersonate(userId: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/admin/users/${userId}/impersonate`, {})
      .pipe(
        tap(response => {
          if (response.success && response.token) {
            // Preserve the admin's session (only if not already impersonating)
            if (localStorage.getItem('impersonating') !== 'true') {
              localStorage.setItem('admin_token', this.getToken() || '');
              localStorage.setItem('admin_user', localStorage.getItem('user') || '');
            }
            localStorage.setItem('token', response.token);
            localStorage.setItem('user', JSON.stringify(response.user));
            localStorage.setItem('impersonating', 'true');
            this.currentUserSubject.next(response.user);
            this.impersonatingSubject.next(true);
          }
        })
      );
  }

  // Ends impersonation and restores the original admin session. Tries the backend
  // for a fresh admin token; falls back to the locally saved admin session.
  stopImpersonation(): Observable<any> {
    return new Observable(observer => {
      const restoreLocally = () => {
        const adminToken = localStorage.getItem('admin_token');
        const adminUserStr = localStorage.getItem('admin_user');
        if (adminToken && adminUserStr) {
          localStorage.setItem('token', adminToken);
          localStorage.setItem('user', adminUserStr);
          this.currentUserSubject.next(JSON.parse(adminUserStr));
        }
        this.clearImpersonationState();
      };

      this.http.post(`${this.apiUrl}/auth/stop-impersonation`, {}).subscribe({
        next: (response: any) => {
          if (response.success && response.token) {
            localStorage.setItem('token', response.token);
            localStorage.setItem('user', JSON.stringify(response.user));
            this.currentUserSubject.next(response.user);
            this.clearImpersonationState();
          } else {
            restoreLocally();
          }
          observer.next(response);
          observer.complete();
        },
        error: (err) => {
          // Backend unreachable/expired — fall back to the saved admin session
          restoreLocally();
          observer.next({ success: true, fallback: true });
          observer.complete();
        }
      });
    });
  }

  private clearImpersonationState(): void {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    localStorage.removeItem('impersonating');
    this.impersonatingSubject.next(false);
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  getCurrentUser(): User | null {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  isAdmin(): boolean {
    const user = this.getCurrentUser();
    return user?.role === 'admin';
  }

  isAgent(): boolean {
    const user = this.getCurrentUser();
    return user?.role === 'agent' || user?.role === 'admin';
  }

  getMe(): Observable<any> {
    return this.http.get(`${this.apiUrl}/auth/me`);
  }

  forgotPassword(email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/forgot-password`, { email });
  }

  resetPassword(token: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/reset-password/${token}`, { password });
  }

  exchangeToken(autoLoginToken: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/auth/token-exchange`, { token: autoLoginToken })
      .pipe(
        tap(response => {
          if (response.success && response.token) {
            localStorage.setItem('token', response.token);
            localStorage.setItem('user', JSON.stringify(response.user));
            this.currentUserSubject.next(response.user);
          }
        })
      );
  }

  getAuthHeaders(): HttpHeaders {
    const token = this.getToken();
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }

  updateCurrentUser(user: User): void {
    localStorage.setItem('user', JSON.stringify(user));
    this.currentUserSubject.next(user);
  }
}
