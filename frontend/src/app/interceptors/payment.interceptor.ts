import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';

@Injectable()
export class PaymentInterceptor implements HttpInterceptor {
  constructor(private router: Router) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        // PAYMENT REDIRECT TEMPORARILY DISABLED
        // TODO: Re-enable when ready to enforce payment requirements
        /*
        // Check for payment required error
        if (error.status === 403 && error.error?.paymentRequired) {
          // Redirect based on payment status
          if (!error.error.oneTimePaymentCompleted) {
            // Need one-time payment
            this.router.navigate(['/one-time-payment']);
          } else if (!error.error.subscriptionActive) {
            // Need subscription
            this.router.navigate(['/subscription-payment']);
          }
        }
        */
        
        return throwError(() => error);
      })
    );
  }
}
