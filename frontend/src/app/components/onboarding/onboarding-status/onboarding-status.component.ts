import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-onboarding-status',
  templateUrl: './onboarding-status.component.html',
  styleUrls: ['./onboarding-status.component.css']
})
export class OnboardingStatusComponent implements OnInit, OnDestroy {
  application: any = null;
  loading: boolean = false;
  error: string = '';
  fetchingDocument: boolean = false;

  // The signed PDF lives under the protected /uploads path, which requires an
  // Authorization header — <a href>/<object data> can't send one, so it's
  // fetched via HttpClient (auth interceptor attaches the header) and kept
  // here as a blob: URL for the inline viewer/download/view-in-tab actions.
  documentBlobUrl: string | null = null;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadApplication();
  }

  ngOnDestroy(): void {
    if (this.documentBlobUrl) window.URL.revokeObjectURL(this.documentBlobUrl);
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
        } else if (this.application?.docusign?.documentUrl) {
          this.loadDocumentBlob(this.application.docusign.documentUrl);
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
          this.loadDocumentBlob(response.documentUrl);
        }
        this.fetchingDocument = false;
      },
      error: (error) => {
        console.error('Failed to fetch signed document:', error);
        this.fetchingDocument = false;
      }
    });
  }

  private loadDocumentBlob(documentUrl: string): void {
    this.http.get(documentUrl, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        if (this.documentBlobUrl) window.URL.revokeObjectURL(this.documentBlobUrl);
        this.documentBlobUrl = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      },
      error: (error) => console.error('Failed to load signed document:', error)
    });
  }

  downloadSignedDocument(): void {
    if (!this.documentBlobUrl) return;
    const a = document.createElement('a');
    a.href = this.documentBlobUrl;
    a.download = 'Signed_APA_Agreement.pdf';
    a.click();
  }

  viewSignedDocument(): void {
    if (!this.documentBlobUrl) return;
    window.open(this.documentBlobUrl, '_blank');
  }
}
