import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PublicService } from '../../services/public.service';

@Component({
  selector: 'app-payment-success',
  templateUrl: './payment-success.component.html',
  styleUrls: ['./payment-success.component.css']
})
export class PaymentSuccessComponent implements OnInit {
  loading = true;
  error = '';
  success = false;
  accountCreated = false;
  email = '';
  setPasswordToken = '';
  redirectCountdown = 5;
  private readonly sessionParam = 'session_id';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private publicService: PublicService
  ) {}

  ngOnInit(): void {
    const sessionId = this.route.snapshot.queryParams[this.sessionParam];
    
    if (!sessionId) {
      this.error = 'Invalid payment session';
      this.loading = false;
      return;
    }

    this.verifyPayment(sessionId);
  }

  verifyPayment(sessionId: string): void {
    this.publicService.verifyPayment(sessionId).subscribe({
      next: (response) => {
        this.loading = false;
        this.success = true;
        this.accountCreated = response.accountCreated;
        this.email = response.email;
        this.setPasswordToken = response.setPasswordToken || '';
        this.stripSessionFromUrl();
        
        // Start countdown
        this.startRedirectCountdown();
      },
      error: (error) => {
        this.loading = false;
        this.error = error.error?.message || 'Failed to verify payment';
        this.stripSessionFromUrl();
      }
    });
  }

  private stripSessionFromUrl(): void {
    this.router.navigate([], {
      queryParams: { [this.sessionParam]: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  startRedirectCountdown(): void {
    const interval = setInterval(() => {
      this.redirectCountdown--;
      
      if (this.redirectCountdown <= 0) {
        clearInterval(interval);
        this.navigateNext();
      }
    }, 1000);
  }

  navigateNext(): void {
    // If we have a set-password token, go to password setup; otherwise login
    if (this.setPasswordToken) {
      this.router.navigate(['/reset-password'], {
        queryParams: { token: this.setPasswordToken }
      });
    } else {
      this.router.navigate(['/login'], {
        queryParams: { 
          message: 'Account created successfully. Check your email for login credentials.' 
        }
      });
    }
  }

  navigateToLogin(): void {
    this.router.navigate(['/login'], {
      queryParams: { 
        message: 'Account created successfully. Check your email for login credentials.' 
      }
    });
  }
}
