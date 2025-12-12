import { Component, OnInit } from '@angular/core';
import { OnboardingService } from '../../../services/onboarding.service';
import { ONBOARDING_STEPS, OnboardingStepMeta } from '../../../models/onboarding.model';

@Component({
  selector: 'app-onboarding-status',
  templateUrl: './onboarding-status.component.html',
  styleUrls: ['./onboarding-status.component.css']
})
export class OnboardingStatusComponent implements OnInit {
  onboarding: any = null;
  steps: OnboardingStepMeta[] = ONBOARDING_STEPS;
  loading = true;
  error = '';

  constructor(private onboardingService: OnboardingService) { }

  ngOnInit(): void {
    this.loadOnboarding();
  }

  loadOnboarding(): void {
    this.loading = true;
    this.error = '';
    
    this.onboardingService.getMyOnboarding().subscribe({
      next: (response) => {
        this.onboarding = response.onboarding;
        this.loading = false;
      },
      error: (error) => {
        this.error = error.error?.message || 'Failed to load onboarding status';
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

  downloadDocument(stepKey: string): void {
    const stepData = this.getStepData(stepKey);
    if (!stepData || !stepData.fileName) {
      return;
    }

    this.onboardingService.downloadMyDocument(stepKey).subscribe({
      next: (blob) => {
        this.onboardingService.downloadFile(blob, stepData.originalName || stepData.fileName);
      },
      error: (error) => {
        this.error = 'Failed to download document';
      }
    });
  }

  getCompletedSteps(): number {
    if (!this.onboarding?.steps) return 0;
    
    return Object.values(this.onboarding.steps).filter((step: any) => 
      step && step.fileName
    ).length;
  }

  getTotalSteps(): number {
    return this.steps.length;
  }

  getProgressPercentage(): number {
    const total = this.getTotalSteps();
    const completed = this.getCompletedSteps();
    return total > 0 ? (completed / total) * 100 : 0;
  }

  canReupload(stepKey: string): boolean {
    const status = this.getStepStatus(stepKey);
    return status === 'missing' || status === 'rejected' || status === 'not-started';
  }

  getStatusMessage(): string {
    const status = this.getOverallStatus();
    switch (status) {
      case 'not-started':
        return 'You haven\'t started your onboarding yet. Upload your documents to get started.';
      case 'pending':
        return 'Your documents are under review. We\'ll notify you once they\'re processed.';
      case 'approved':
        return 'Congratulations! Your onboarding has been approved. You\'re all set!';
      case 'rejected':
        return 'Some of your documents need attention. Please review the feedback and re-upload.';
      case 'missing':
        return 'Additional documents are required. Please upload the missing items.';
      default:
        return '';
    }
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
}
