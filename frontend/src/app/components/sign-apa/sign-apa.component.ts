import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PublicService } from '../../services/public.service';
import { BrandingService, BrandingConfig } from '../../services/branding.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-sign-apa',
  templateUrl: './sign-apa.component.html',
  styleUrls: ['./sign-apa.component.css']
})
export class SignApaComponent implements OnInit {
  applicationId = '';
  loading = false;
  error = '';
  signed = false;
  agreeToTerms = false;
  agreeToElectronic = false;
  branding: BrandingConfig = { appName: 'RHP Office', appLogo: null };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private publicService: PublicService,
    private brandingService: BrandingService
  ) {}

  ngOnInit(): void {
    this.branding = this.brandingService.getCurrentBranding();
    this.applicationId = this.route.snapshot.queryParams['applicationId'] || '';
    
    if (!this.applicationId) {
      this.error = 'Invalid application ID';
    }
  }

  getLogoUrl(): string {
    return this.branding.appLogo || '';
  }

  signDocument(): void {
    if (this.loading || this.signed) return;
    
    this.loading = true;
    this.error = '';

    this.publicService.completeSignature(this.applicationId).subscribe({
      next: (response) => {
        this.loading = false;
        this.signed = true;
        
        // Redirect to payment page after 3 seconds
        setTimeout(() => {
          if (response.paymentUrl) {
            window.location.href = response.paymentUrl;
          } else {
            this.router.navigate(['/apa-payment'], { 
              queryParams: { applicationId: this.applicationId } 
            });
          }
        }, 3000);
      },
      error: (error) => {
        this.loading = false;
        this.error = error.error?.message || 'Failed to complete signature. Please try again.';
      }
    });
  }
}
