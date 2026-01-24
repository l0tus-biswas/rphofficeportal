import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-onboarding-status',
  templateUrl: './onboarding-status.component.html',
  styleUrls: ['./onboarding-status.component.css']
})
export class OnboardingStatusComponent implements OnInit {
  application: any = null;
  loading: boolean = false;
  error: string = '';
  fetchingDocument: boolean = false;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadApplication();
  }

  loadApplication(): void {
    this.loading = true;
    this.error = '';
    
    this.http.get(`${environment.apiUrl}/user/apa-application`).subscribe({
      next: (response: any) => {
        this.application = response.application;
        this.loading = false;
        
        // Auto-fetch signed document if status is completed but URL is missing
        if (this.application?.docusign?.status === 'completed' && !this.application?.docusign?.documentUrl) {
          this.fetchSignedDocument();
        }
      },
      error: (error) => {
        this.error = error.error?.message || 'Failed to load application';
        this.loading = false;
      }
    });
  }

  fetchSignedDocument(): void {
    this.fetchingDocument = true;
    
    this.http.post(`${environment.apiUrl}/user/apa-application/fetch-signed-document`, {}).subscribe({
      next: (response: any) => {
        if (response.documentUrl) {
          this.application.docusign.documentUrl = response.documentUrl;
        }
        this.fetchingDocument = false;
      },
      error: (error) => {
        console.error('Failed to fetch signed document:', error);
        this.fetchingDocument = false;
      }
    });
  }
}
