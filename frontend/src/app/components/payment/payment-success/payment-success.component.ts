import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PublicService } from '../../../services/public.service';
import { AuthService } from '../../../services/auth.service';
import { OnboardingService } from '../../../services/onboarding.service';

@Component({
  selector: 'app-payment-success',
  templateUrl: './payment-success.component.html',
  styleUrls: ['./payment-success.component.css']
})
export class PaymentSuccessComponent implements OnInit {
  paymentType = '';
  redirecting = true;
  processing = false;
  error = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private publicService: PublicService,
    private authService: AuthService,
    private onboardingService: OnboardingService
  ) { }

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.paymentType = params['type'] || 'one-time';
      
      // Check if this is registration flow
      const pendingApplication = localStorage.getItem('pendingApplication');
      
      if (this.paymentType === 'one-time' && pendingApplication) {
        // Complete registration after payment
        this.completeRegistration();
      } else {
        // Regular payment success - redirect after 3 seconds
        setTimeout(() => {
          if (this.paymentType === 'one-time') {
            this.router.navigate(['/subscription-payment']);
          } else {
            this.router.navigate(['/dashboard']);
          }
        }, 3000);
      }
    });
  }

  completeRegistration(): void {
    this.processing = true;
    
    try {
      const pendingApp = JSON.parse(localStorage.getItem('pendingApplication') || '{}');
      const pendingDocs = JSON.parse(sessionStorage.getItem('pendingDocuments') || '{}');
      
      if (!pendingApp.formData) {
        this.error = 'Application data not found. Please contact support.';
        this.processing = false;
        return;
      }
      
      // Create account
      this.publicService.submitApplication(pendingApp.formData, pendingApp.referralCode).subscribe({
        next: (response) => {
          // Login with new credentials
          this.authService.login({
            email: response.credentials.email,
            password: response.credentials.password
          }).subscribe({
            next: (loginResponse) => {
              // Upload documents
              const formData = new FormData();
              Object.keys(pendingDocs).forEach(key => {
                const fileData = pendingDocs[key];
                // Convert base64 back to blob
                const blob = this.dataURItoBlob(fileData.data);
                const file = new File([blob], fileData.name, { type: fileData.type });
                formData.append(key, file);
              });
              
              this.onboardingService.uploadMyDocuments(formData).subscribe({
                next: () => {
                  // Clear temporary data
                  localStorage.removeItem('pendingApplication');
                  sessionStorage.removeItem('pendingDocuments');
                  
                  this.processing = false;
                  
                  // Redirect to subscription payment
                  setTimeout(() => {
                    this.router.navigate(['/subscription-payment']);
                  }, 2000);
                },
                error: (error) => {
                  console.error('Document upload error:', error);
                  // Continue to subscription even if docs fail
                  localStorage.removeItem('pendingApplication');
                  sessionStorage.removeItem('pendingDocuments');
                  
                  setTimeout(() => {
                    this.router.navigate(['/subscription-payment']);
                  }, 2000);
                }
              });
            },
            error: (error) => {
              this.error = 'Failed to complete registration. Please contact support.';
              this.processing = false;
            }
          });
        },
        error: (error) => {
          this.error = error.error?.message || 'Failed to create account. Please contact support.';
          this.processing = false;
        }
      });
    } catch (error) {
      this.error = 'Failed to process registration data. Please contact support.';
      this.processing = false;
    }
  }

  dataURItoBlob(dataURI: string): Blob {
    const byteString = atob(dataURI.split(',')[1]);
    const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
  }
}
