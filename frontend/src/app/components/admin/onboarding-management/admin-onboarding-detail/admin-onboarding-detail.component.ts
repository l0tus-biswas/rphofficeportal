import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { OnboardingHubService, AdminOnboardingAgentDetail, OnboardingDocument } from '../../../../services/onboarding-hub.service';

@Component({
  selector: 'app-admin-onboarding-detail',
  templateUrl: './admin-onboarding-detail.component.html',
  styleUrls: ['./admin-onboarding-detail.component.css']
})
export class AdminOnboardingDetailComponent implements OnInit {
  userId = '';
  detail: AdminOnboardingAgentDetail | null = null;
  
  loading = true;
  error = '';
  success = '';
  
  // Action modal state
  selectedDocumentId = '';
  selectedDocumentLabel = '';
  showActionModal = false;
  actionStatus: 'pending' | 'approved' | 'rejected' | 'missing' = 'pending';
  actionComment = '';
  actionLoading = false;
  
  // PDF viewer state
  showPdfModal = false;
  pdfUrl: string | null = null;
  pdfLoading = false;
  currentPdfName = '';

  constructor(
    private onboardingHubService: OnboardingHubService,
    private route: ActivatedRoute,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.userId = this.route.snapshot.params['userId'];
    if (!this.userId) {
      this.router.navigate(['/admin/onboarding']);
      return;
    }
    this.loadDetail();
  }

  loadDetail(): void {
    this.loading = true;
    this.error = '';
    
    this.onboardingHubService.getAdminAgentDetail(this.userId).subscribe({
      next: (response) => {
        this.detail = response;
        this.loading = false;
      },
      error: (error) => {
        this.error = error.error?.message || 'Failed to load onboarding details';
        this.loading = false;
      }
    });
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'approved': return 'badge bg-success';
      case 'rejected': return 'badge bg-danger';
      case 'missing': return 'badge bg-warning text-dark';
      case 'pending': return 'badge bg-info';
      default: return 'badge bg-secondary';
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'approved': return 'bi-check-circle-fill';
      case 'rejected': return 'bi-x-circle-fill';
      case 'missing': return 'bi-exclamation-triangle-fill';
      case 'pending': return 'bi-clock-fill';
      default: return 'bi-circle';
    }
  }

  hasFile(doc: OnboardingDocument | null): boolean {
    return !!(doc?.filePath || doc?.externalLink);
  }

  getFileUrl(filePath: string): string {
    const base = environment.apiUrl.replace('/api', '');
    return `${base}/${filePath}`;
  }

  viewDocument(doc: OnboardingDocument | null): void {
    if (!doc) return;

    if (doc.externalLink) {
      window.open(doc.externalLink, '_blank');
      return;
    }

    if (!doc.filePath) return;

    this.currentPdfName = doc.originalFileName || 'Document';
    this.showPdfModal = true;
    this.pdfLoading = false;

    if (this.pdfUrl) {
      URL.revokeObjectURL(this.pdfUrl);
      this.pdfUrl = null;
    }

    this.pdfUrl = this.getFileUrl(doc.filePath);
  }

  downloadDocument(doc: OnboardingDocument | null): void {
    if (!doc) return;
    if (doc.filePath) {
      window.open(this.getFileUrl(doc.filePath), '_blank');
      return;
    }
    if (doc.externalLink) {
      window.open(doc.externalLink, '_blank');
    }
  }
  
  closePdfModal(): void {
    this.showPdfModal = false;
    if (this.pdfUrl) {
      URL.revokeObjectURL(this.pdfUrl);
      this.pdfUrl = null;
    }
    this.currentPdfName = '';
    this.pdfLoading = false;
  }

  openActionModal(documentId: string, label: string, currentStatus: string, currentComment = ''): void {
    this.selectedDocumentId = documentId;
    this.selectedDocumentLabel = label;
    this.actionStatus = (currentStatus as any) || 'pending';
    this.actionComment = currentComment || '';
    this.showActionModal = true;
  }

  closeActionModal(): void {
    this.showActionModal = false;
    this.selectedDocumentId = '';
    this.actionStatus = 'pending';
    this.actionComment = '';
    this.actionLoading = false;
  }

  submitAction(): void {
    this.actionLoading = true;
    this.error = '';
    this.success = '';

    this.onboardingHubService.updateAdminDocumentStatus(
      this.selectedDocumentId,
      this.actionStatus,
      this.actionComment
    ).subscribe({
      next: () => {
        this.success = `${this.selectedDocumentLabel} status updated successfully`;
        this.actionLoading = false;
        this.closeActionModal();
        this.loadDetail();
      },
      error: (error) => {
        this.error = error.error?.message || 'Failed to update status';
        this.actionLoading = false;
      }
    });
  }

  getCompletedSteps(): number {
    if (!this.detail?.cards) return 0;
    return this.detail.cards.filter(c => c.docType.required && this.hasFile(c.document)).length;
  }

  getRequiredCount(): number {
    if (!this.detail?.cards) return 0;
    return this.detail.cards.filter(c => c.docType.required).length;
  }

  getApprovedSteps(): number {
    if (!this.detail?.cards) return 0;
    return this.detail.cards.filter(c => c.docType.required && c.document?.status === 'approved').length;
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatFileSize(bytes: number): string {
    if (!bytes) return 'N/A';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  goBack(): void {
    this.router.navigate(['/admin/onboarding']);
  }
}
