import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { OnboardingService } from '../../../../services/onboarding.service';
import { AdminService } from '../../../../services/admin.service';
import { ONBOARDING_STEPS, OnboardingStepMeta } from '../../../../models/onboarding.model';

@Component({
  selector: 'app-admin-onboarding-detail',
  templateUrl: './admin-onboarding-detail.component.html',
  styleUrls: ['./admin-onboarding-detail.component.css']
})
export class AdminOnboardingDetailComponent implements OnInit {
  userId = '';
  onboarding: any = null;
  steps: OnboardingStepMeta[] = ONBOARDING_STEPS;
  
  loading = true;
  error = '';
  success = '';
  
  // Action modal state
  selectedStep = '';
  selectedStepLabel = '';
  showActionModal = false;
  actionStatus = '';
  actionComment = '';
  actionLoading = false;
  
  // Note modal state
  showNoteModal = false;
  noteMessage = '';
  noteLoading = false;
  
  // PDF viewer state
  showPdfModal = false;
  pdfUrl: string | null = null;
  pdfLoading = false;
  currentPdfName = '';

  constructor(
    private onboardingService: OnboardingService,
    private adminService: AdminService,
    private route: ActivatedRoute,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.userId = this.route.snapshot.params['userId'];
    if (!this.userId) {
      this.router.navigate(['/admin/onboarding']);
      return;
    }
    this.loadOnboarding();
  }

  loadOnboarding(): void {
    this.loading = true;
    this.error = '';
    
    this.onboardingService.getUserOnboarding(this.userId).subscribe({
      next: (response) => {
        this.onboarding = response.onboarding;
        this.loading = false;
      },
      error: (error) => {
        this.error = error.error?.message || 'Failed to load onboarding details';
        this.loading = false;
      }
    });
  }

  getStepData(stepKey: string): any {
    return this.onboarding?.steps?.[stepKey] || {};
  }

  hasFile(stepKey: string): boolean {
    const step = this.getStepData(stepKey);
    return step && step.fileName;
  }

  getStepStatus(stepKey: string): string {
    const step = this.getStepData(stepKey);
    return step?.status || 'not-started';
  }

  getOverallStatus(): string {
    return this.onboarding?.status || 'not-started';
  }

  getStatusBadgeClass(status: string): string {
    return this.onboardingService.getStatusClass(status);
  }

  getStatusIcon(status: string): string {
    return this.onboardingService.getStatusIcon(status);
  }

  viewDocument(stepKey: string): void {
    const stepData = this.getStepData(stepKey);
    if (!stepData || !stepData.fileName) {
      return;
    }

    this.pdfLoading = true;
    this.currentPdfName = stepData.originalName || stepData.fileName;
    this.showPdfModal = true;

    this.onboardingService.downloadUserDocument(this.userId, stepKey).subscribe({
      next: (blob) => {
        // Create object URL from blob
        if (this.pdfUrl) {
          URL.revokeObjectURL(this.pdfUrl);
        }
        this.pdfUrl = URL.createObjectURL(blob);
        this.pdfLoading = false;
      },
      error: (error) => {
        this.error = 'Failed to load document';
        this.pdfLoading = false;
        this.closePdfModal();
      }
    });
  }

  downloadDocument(stepKey: string): void {
    const stepData = this.getStepData(stepKey);
    if (!stepData || !stepData.fileName) {
      return;
    }

    this.onboardingService.downloadUserDocument(this.userId, stepKey).subscribe({
      next: (blob) => {
        this.onboardingService.downloadFile(blob, stepData.originalName || stepData.fileName);
      },
      error: (error) => {
        this.error = 'Failed to download document';
      }
    });
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

  openActionModal(stepKey: string, currentStatus: string): void {
    const stepMeta = this.steps.find(s => s.key === stepKey);
    if (!stepMeta) return;
    
    this.selectedStep = stepKey;
    this.selectedStepLabel = stepMeta.label;
    this.actionStatus = currentStatus === 'approved' ? 'approved' : 'pending';
    this.actionComment = this.getStepData(stepKey).adminComment || '';
    this.showActionModal = true;
  }

  closeActionModal(): void {
    this.showActionModal = false;
    this.selectedStep = '';
    this.actionStatus = '';
    this.actionComment = '';
    this.actionLoading = false;
  }

  submitAction(): void {
    if (!this.actionStatus) {
      return;
    }

    this.actionLoading = true;
    this.error = '';
    this.success = '';

    this.onboardingService.updateStepStatus(
      this.userId,
      this.selectedStep,
      this.actionStatus,
      this.actionComment
    ).subscribe({
      next: (response) => {
        this.success = `${this.selectedStepLabel} status updated successfully`;
        this.actionLoading = false;
        this.closeActionModal();
        this.loadOnboarding();
      },
      error: (error) => {
        this.error = error.error?.message || 'Failed to update status';
        this.actionLoading = false;
      }
    });
  }

  openNoteModal(): void {
    this.noteMessage = '';
    this.showNoteModal = true;
  }

  closeNoteModal(): void {
    this.showNoteModal = false;
    this.noteMessage = '';
    this.noteLoading = false;
  }

  submitNote(): void {
    if (!this.noteMessage.trim()) {
      return;
    }

    this.noteLoading = true;
    this.error = '';
    this.success = '';

    this.onboardingService.addNote(this.userId, this.noteMessage).subscribe({
      next: (response) => {
        this.success = 'Note added successfully';
        this.noteLoading = false;
        this.closeNoteModal();
        this.loadOnboarding();
      },
      error: (error) => {
        this.error = error.error?.message || 'Failed to add note';
        this.noteLoading = false;
      }
    });
  }

  getCompletedSteps(): number {
    if (!this.onboarding?.steps) return 0;
    return Object.values(this.onboarding.steps).filter((step: any) => 
      step && step.fileName
    ).length;
  }

  getApprovedSteps(): number {
    if (!this.onboarding?.steps) return 0;
    return Object.values(this.onboarding.steps).filter((step: any) => 
      step && step.status === 'approved'
    ).length;
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

  deleteOnboarding(): void {
    const userName = this.onboarding?.user?.name || 'this user';
    if (!confirm(`Are you sure you want to delete the onboarding record for ${userName}? The user will need to upload all documents again.`)) {
      return;
    }

    this.adminService.deleteOnboarding(this.userId).subscribe({
      next: (response) => {
        alert(response.message || 'Onboarding record deleted successfully');
        this.router.navigate(['/admin/onboarding']);
      },
      error: (error) => {
        this.error = error.error?.message || 'Failed to delete onboarding record';
      }
    });
  }
}
