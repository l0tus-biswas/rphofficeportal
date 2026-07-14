import { getAppTimezone } from '../../../../services/timezone.service';
import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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
  
  // Bank info state
  bankInfoDocId = '';
  bankInfo: { routingNumber: string; accountNumber: string; accountType: string } | null = null;
  bankInfoLoading = false;

  // Admin upload state
  @ViewChild('adminFileInput') adminFileInput!: ElementRef<HTMLInputElement>;
  uploadingDocTypeId = '';
  uploadLoading = false;

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

  private guessMimeType(fileName: string): string {
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    const types: Record<string, string> = {
      pdf: 'application/pdf',
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp'
    };
    return types[ext] || 'application/octet-stream';
  }

  // Opens the document in a new tab rather than an <iframe> — framing a
  // blob: URL requires 'blob:' in the CSP frame-src directive, which is one
  // more thing to keep in sync across environments; a new-tab navigation
  // isn't subject to frame-src at all, so it works everywhere without that.
  viewDocument(doc: OnboardingDocument | null): void {
    if (!doc) return;

    // filePath (our own protected storage) must win over externalLink when
    // both are set — some records store the SAME internal /uploads path in
    // externalLink too, which would otherwise bypass authentication entirely.
    if (!doc.filePath || !doc._id) {
      if (doc.externalLink) window.open(doc.externalLink, '_blank');
      return;
    }

    // Open the tab synchronously (inside the click handler) so popup
    // blockers don't treat it as an unrequested popup once the async blob
    // fetch below resolves.
    const win = window.open('', '_blank');

    // The file lives under the protected /uploads path (or behind the
    // authenticated download route) — a raw <a href> can't send the
    // Authorization header, so fetch it via HttpClient and open as a blob.
    this.onboardingHubService.downloadDocumentBlob(this.userId, doc._id).subscribe({
      next: (blob) => {
        const typed = new Blob([blob], { type: this.guessMimeType(doc.originalFileName || '') });
        const url = URL.createObjectURL(typed);
        if (win && !win.closed) win.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      },
      error: (err) => {
        if (win && !win.closed) win.close();
        this.error = err.error?.message || 'Failed to load document';
      }
    });
  }

  downloadDocument(doc: OnboardingDocument | null): void {
    if (!doc) return;

    if (!doc.filePath || !doc._id) {
      if (doc.externalLink) window.open(doc.externalLink, '_blank');
      return;
    }

    this.onboardingHubService.downloadDocumentBlob(this.userId, doc._id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(new Blob([blob], { type: this.guessMimeType(doc.originalFileName || '') }));
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.originalFileName || 'document';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to download document';
      }
    });
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
    return new Date(date).toLocaleDateString('en-US', { timeZone: getAppTimezone(), 
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

  viewBankInfo(documentId: string): void {
    if (this.bankInfoDocId === documentId) {
      this.bankInfoDocId = '';
      this.bankInfo = null;
      return;
    }
    this.bankInfoLoading = true;
    this.bankInfoDocId = documentId;
    this.bankInfo = null;

    this.onboardingHubService.getBankInfo(documentId).subscribe({
      next: (info) => {
        this.bankInfo = info;
        this.bankInfoLoading = false;
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to load banking information';
        this.bankInfoLoading = false;
        this.bankInfoDocId = '';
      }
    });
  }

  // Admin upload on behalf of agent
  triggerUpload(docTypeId: string): void {
    this.uploadingDocTypeId = docTypeId;
    this.adminFileInput.nativeElement.value = '';
    this.adminFileInput.nativeElement.click();
  }

  onAdminFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length || !this.uploadingDocTypeId) return;

    const file = input.files[0];
    this.uploadLoading = true;
    this.error = '';
    this.success = '';

    const formData = new FormData();
    formData.append('docFile', file);
    formData.append('docTypeId', this.uploadingDocTypeId);
    formData.append('agentId', this.userId);

    this.onboardingHubService.uploadDocument(formData).subscribe({
      next: () => {
        this.success = 'Document uploaded successfully on behalf of agent';
        this.uploadLoading = false;
        this.uploadingDocTypeId = '';
        this.loadDetail();
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to upload document';
        this.uploadLoading = false;
        this.uploadingDocTypeId = '';
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/admin/onboarding']);
  }
}
