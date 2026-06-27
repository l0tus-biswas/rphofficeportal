import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, firstValueFrom } from 'rxjs';
import { map, shareReplay, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/**
 * Runtime public configuration fetched from the backend so values aren't baked
 * into the frontend build. The Stripe publishable key lives in the backend .env
 * (STRIPE_PUBLISHABLE_KEY) and is served by GET /api/public/stripe-key.
 */
@Injectable({ providedIn: 'root' })
export class PublicConfigService {
  private apiUrl = environment.apiUrl;
  private stripeKey$?: Observable<string>;

  constructor(private http: HttpClient) {}

  /** Cached (fetched once) Stripe publishable key from the backend. */
  getStripePublishableKey(): Observable<string> {
    if (!this.stripeKey$) {
      this.stripeKey$ = this.http
        .get<{ publishableKey: string }>(`${this.apiUrl}/public/stripe-key`)
        .pipe(
          map(r => r?.publishableKey || ''),
          // Fall back to the build-time key so local dev still works if the
          // endpoint is unreachable.
          catchError(() => of(environment.stripePublishableKey || '')),
          shareReplay(1)
        );
    }
    return this.stripeKey$;
  }

  /** Promise helper for async/await call sites. */
  stripeKey(): Promise<string> {
    return firstValueFrom(this.getStripePublishableKey());
  }
}
