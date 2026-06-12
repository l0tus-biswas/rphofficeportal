import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private router: Router) { }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Get token directly from localStorage to avoid circular dependency
    const token = localStorage.getItem('token');

    if (token) {
      req = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      });
    }

    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401) {
          // Clear storage and redirect to login
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          this.router.navigate(['/login']);
        } else if (error.status === 503 && error.error?.maintenanceMode) {
          // Emergency maintenance mode: force non-admin users back to login
          const userRaw = localStorage.getItem('user');
          let user: any = null;
          try {
            user = userRaw ? JSON.parse(userRaw) : null;
          } catch {
            // Invalid JSON in localStorage — clear and redirect
            localStorage.removeItem('user');
          }
          if (!user || user.role !== 'admin') {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            this.router.navigate(['/login'], {
              queryParams: {
                maintenanceMessage: error.error?.message || 'RHP Office is temporarily under maintenance. Please check back shortly.'
              }
            });
          }
        }
        return throwError(() => error);
      })
    );
  }
}
