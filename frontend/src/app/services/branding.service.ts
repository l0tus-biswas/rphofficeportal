import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface BrandingConfig {
  appName: string;
  appLogo: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class BrandingService {
  private apiUrl = `${environment.apiUrl}/admin/config`;
  private publicApiUrl = `${environment.apiUrl}/public`;
  private brandingSubject = new BehaviorSubject<BrandingConfig>({
    appName: 'Escape',
    appLogo: null
  });
  
  public branding$ = this.brandingSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadBranding();
  }

  loadBranding(): void {
    this.http.get<any>(`${this.publicApiUrl}/branding`).subscribe({
      next: (response) => {
        this.brandingSubject.next({
          appName: response.appName || 'Escape',
          appLogo: response.appLogo ? `${environment.apiUrl.replace('/api', '')}${response.appLogo}` : null
        });
      },
      error: (error) => {
        console.error('Error loading branding:', error);
      }
    });
  }

  getBranding(): Observable<any> {
    return this.http.get<any>(`${this.publicApiUrl}/branding`);
  }

  updateBranding(formData: FormData): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/branding`, formData).pipe(
      tap(() => this.loadBranding())
    );
  }

  getCurrentBranding(): BrandingConfig {
    return this.brandingSubject.value;
  }
}
