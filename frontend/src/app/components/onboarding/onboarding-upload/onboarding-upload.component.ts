import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { OnboardingService } from '../../../services/onboarding.service';
import { ONBOARDING_STEPS, OnboardingStepMeta } from '../../../models/onboarding.model';

@Component({
  selector: 'app-onboarding-upload',
  templateUrl: './onboarding-upload.component.html',
  styleUrls: ['./onboarding-upload.component.css']
})
export class OnboardingUploadComponent implements OnInit {
  currentStep = 0;
  steps: OnboardingStepMeta[] = ONBOARDING_STEPS;
  
  selectedFiles: Map<string, File> = new Map();
  uploadProgress: Map<string, number> = new Map();
  
  loading = false;
  error = '';
  success = false;
  
  existingOnboarding: any = null;
  loadingExisting = true;

  constructor(
    private onboardingService: OnboardingService,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.loadExistingOnboarding();
  }

  loadExistingOnboarding(): void {
    this.loadingExisting = true;
    this.onboardingService.getMyOnboarding().subscribe({
      next: (response) => {
        this.existingOnboarding = response.onboarding;
        this.loadingExisting = false;
      },
      error: (error) => {
        console.error('Error loading onboarding:', error);
        this.loadingExisting = false;
      }
    });
  }

  get currentStepMeta(): OnboardingStepMeta {
    return this.steps[this.currentStep];
  }

  get progress(): number {
    return ((this.currentStep + 1) / this.steps.length) * 100;
  }

  onFileSelected(event: any, stepKey: string): void {
    const file: File = event.target.files[0];
    
    if (!file) {
      return;
    }

    // Validate file type
    if (file.type !== 'application/pdf') {
      this.error = 'Only PDF files are allowed';
      event.target.value = '';
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      this.error = 'File size must be less than 10MB';
      event.target.value = '';
      return;
    }

    this.selectedFiles.set(stepKey, file);
    this.error = '';
  }

  removeFile(stepKey: string): void {
    this.selectedFiles.delete(stepKey);
  }

  hasFileForCurrentStep(): boolean {
    return this.selectedFiles.has(this.currentStepMeta.key);
  }

  hasExistingFileForCurrentStep(): boolean {
    const stepData = this.existingOnboarding?.steps?.[this.currentStepMeta.key];
    return stepData && stepData.fileName;
  }

  getExistingFileStatus(stepKey: string): string {
    return this.existingOnboarding?.steps?.[stepKey]?.status || 'not-started';
  }

  getExistingFileName(stepKey: string): string {
    return this.existingOnboarding?.steps?.[stepKey]?.originalName || '';
  }

  next(): void {
    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++;
      this.error = '';
    }
  }

  previous(): void {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.error = '';
    }
  }

  canSubmit(): boolean {
    // Check if at least one file is selected
    return this.selectedFiles.size > 0;
  }

  onSubmit(): void {
    if (!this.canSubmit()) {
      this.error = 'Please upload at least one document';
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = false;

    const formData = new FormData();
    
    // Append all selected files
    this.selectedFiles.forEach((file, key) => {
      formData.append(key, file);
    });

    this.onboardingService.uploadMyDocuments(formData).subscribe({
      next: (response) => {
        this.success = true;
        this.loading = false;
        this.selectedFiles.clear();
        
        // Reload existing onboarding to show updated status
        this.loadExistingOnboarding();
        
        // Clear success message after delay
        setTimeout(() => {
          this.success = false;
        }, 3000);
      },
      error: (error) => {
        this.error = error.error?.message || 'Upload failed. Please try again.';
        this.loading = false;
      }
    });
  }

  downloadExisting(stepKey: string): void {
    const stepData = this.existingOnboarding?.steps?.[stepKey];
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

  getStatusBadgeClass(status: string): string {
    return this.onboardingService.getStatusClass(status);
  }

  getStatusIcon(status: string): string {
    return this.onboardingService.getStatusIcon(status);
  }
}
