import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

// Global timezone value accessible without DI (for use in formatDate helpers)
let _appTimezone = 'America/New_York';

export function getAppTimezone(): string {
  return _appTimezone;
}

@Injectable({
  providedIn: 'root'
})
export class TimezoneService {
  private timezoneSubject = new BehaviorSubject<string>('America/New_York');
  public timezone$ = this.timezoneSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadTimezone();
  }

  loadTimezone(): void {
    // Priority: user preference > system config > default
    const userTz = this.getUserTimezone();
    if (userTz) {
      _appTimezone = userTz;
      this.timezoneSubject.next(userTz);
      return;
    }

    this.http.get<any>(`${environment.apiUrl}/public/timezone`).subscribe({
      next: (response) => {
        if (response?.timezone) {
          // Only use system config if user has no preference
          const currentUserTz = this.getUserTimezone();
          if (!currentUserTz) {
            _appTimezone = response.timezone;
            this.timezoneSubject.next(response.timezone);
          }
        }
      },
      error: () => {
        // Fallback to default Eastern Time
      }
    });
  }

  private getUserTimezone(): string | null {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        return user.timezone || null;
      }
    } catch {}
    return null;
  }

  getTimezone(): string {
    return this.timezoneSubject.value;
  }
}
