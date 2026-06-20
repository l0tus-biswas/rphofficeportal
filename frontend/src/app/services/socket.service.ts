import { Injectable, NgZone } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket | null = null;
  private connectionStateSubject = new BehaviorSubject<'disconnected' | 'connected' | 'connecting'>('disconnected');
  public connectionState$ = this.connectionStateSubject.asObservable();

  constructor(private authService: AuthService, private ngZone: NgZone) {
    // Connect when user logs in
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.connect();
      } else {
        this.disconnect();
      }
    });
  }

  /**
   * Connect to Socket.IO server
   */
  connect(): void {
    if (this.socket?.connected) {
      return; // Already connected
    }

    const token = this.authService.getToken();
    if (!token) {
      console.error('[Socket] No auth token available');
      return;
    }

    this.connectionStateSubject.next('connecting');

    try {
      // Use baseUrl (http://localhost:5000) not apiUrl (http://localhost:5000/api)
      const socketUrl = environment.baseUrl || 'http://localhost:5000';
      console.log('[Socket] Connecting to', socketUrl);
      this.socket = io(socketUrl, {
        path: '/socket.io/',
        auth: { token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
        // Start with HTTP long-polling (works through any reverse proxy/CDN),
        // then upgrade to WebSocket when the proxy supports the upgrade. This
        // avoids hard "wss:// failed" errors behind proxies that don't forward
        // the WebSocket upgrade, while still using WebSocket where available.
        transports: ['polling', 'websocket'],
        upgrade: true
      });

      this.socket.on('connect', () => {
        console.log('[Socket] Connected:', this.socket?.id);
        this.connectionStateSubject.next('connected');
      });

      this.socket.on('connect_error', (error: any) => {
        console.error('[Socket] Connection error:', error.message || error);
        console.warn('[Socket] Falling back to polling if available');
        // Falls back to polling
      });

      this.socket.on('disconnect', () => {
        console.log('[Socket] Disconnected');
        this.connectionStateSubject.next('disconnected');
      });

      this.socket.on('error', (error: any) => {
        console.error('[Socket] Error:', error);
      });
    } catch (error) {
      console.error('[Socket] Failed to initialize:', error);
      this.connectionStateSubject.next('disconnected');
    }
  }

  /**
   * Disconnect from Socket.IO server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connectionStateSubject.next('disconnected');
    }
  }

  /**
   * Get the socket instance
   */
  getSocket(): Socket | null {
    return this.socket;
  }

  /**
   * Listen to socket events.
   * Safe to call before the socket connects — automatically attaches when
   * connected and re-attaches after every reconnect.
   */
  on<T>(event: string): Observable<T> {
    return new Observable(observer => {
      let listener: ((data: T) => void) | null = null;

      const attach = () => {
        if (this.socket && !listener) {
          listener = (data: T) => this.ngZone.run(() => observer.next(data));
          this.socket.on(event, listener);
        }
      };

      const detach = () => {
        if (listener) {
          this.socket?.off(event, listener);
          listener = null;
        }
      };

      // Attach immediately if already connected
      attach();

      // Re-attach on reconnect, detach on disconnect
      const stateSub = this.connectionState$.subscribe(state => {
        if (state === 'connected') attach();
        else if (state === 'disconnected') detach();
      });

      return () => {
        detach();
        stateSub.unsubscribe();
      };
    });
  }

  /**
   * Emit socket event
   */
  emit(event: string, data?: any): void {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    }
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}
