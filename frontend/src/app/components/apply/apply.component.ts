import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PublicService } from '../../services/public.service';
import { AuthService } from '../../services/auth.service';
import { OnboardingService } from '../../services/onboarding.service';
import { ONBOARDING_STEPS, OnboardingStepMeta } from '../../models/onboarding.model';

@Component({
  selector: 'app-apply',
  templateUrl: './apply.component.html',
  styleUrls: ['./apply.component.css']
})
export class ApplyComponent implements OnInit {
  // Step tracking
  currentStep = 0; // 0 = basic info, 1-5 = onboarding docs
  totalSteps = 6; // 1 basic info + 5 documents
  
  // Basic info form
  applyForm!: FormGroup;
  loading = false;
  success = false;
  error = '';
  referralCode = '';
  agentName = '';
  credentials: any = null;
  invalidReferral = false;
  
  // Onboarding documents
  onboardingSteps: OnboardingStepMeta[] = ONBOARDING_STEPS;
  selectedFiles: Map<string, File> = new Map();
  
  // After account creation
  accountCreated = false;
  userId = '';
  userToken = '';

  constructor(
    private formBuilder: FormBuilder,
    private publicService: PublicService,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private onboardingService: OnboardingService
  ) { }

  ngOnInit(): void {
    this.applyForm = this.formBuilder.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.required, Validators.minLength(10)]],
      address: [''],
      city: [''],
      state: [''],
      zipCode: ['']
    });

    // Get referral code from query params
    this.route.queryParams.subscribe(params => {
      this.referralCode = params['ref'] || '';
      if (this.referralCode) {
        this.loadAgentInfo();
      } else {
        // No referral code provided - mark as invalid
        this.invalidReferral = true;
      }
    });
  }

  loadAgentInfo(): void {
    this.publicService.verifyReferralCode(this.referralCode).subscribe({
      next: (response) => {
        if (response.valid) {
          this.agentName = response.agent.name;
          this.invalidReferral = false;
        } else {
          this.invalidReferral = true;
        }
      },
      error: (error) => {
        this.invalidReferral = true;
        this.error = 'Invalid referral code';
      }
    });
  }

  get progress(): number {
    return ((this.currentStep + 1) / this.totalSteps) * 100;
  }

  get currentOnboardingStep(): OnboardingStepMeta | null {
    if (this.currentStep === 0) return null;
    return this.onboardingSteps[this.currentStep - 1];
  }

  nextStep(): void {
    if (this.currentStep === 0) {
      // Validate and submit basic info first
      this.submitBasicInfo();
    } else if (this.currentStep < this.totalSteps - 1) {
      this.currentStep++;
      this.error = '';
    }
  }

  previousStep(): void {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.error = '';
    }
  }

  submitBasicInfo(): void {
    if (this.applyForm.invalid) {
      Object.keys(this.applyForm.controls).forEach(key => {
        this.applyForm.get(key)?.markAsTouched();
      });
      return;
    }

    // Just move to next step without creating account yet
    this.currentStep = 1;
    this.error = '';
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
    if (!this.currentOnboardingStep) return false;
    return this.selectedFiles.has(this.currentOnboardingStep.key);
  }

  canSubmitFinal(): boolean {
    return this.selectedFiles.size > 0;
  }

  submitOnboardingDocs(): void {
    if (!this.canSubmitFinal()) {
      this.error = 'Please upload at least one document';
      return;
    }

    this.loading = true;
    this.error = '';

    // First create the account
    this.publicService.submitApplication(this.applyForm.value, this.referralCode).subscribe({
      next: (response) => {
        this.credentials = response.credentials;
        this.userId = response.user._id;
        this.accountCreated = true;
        
        // Now login with the temporary credentials
        this.authService.login({
          email: this.credentials.email,
          password: this.credentials.password
        }).subscribe({
          next: (loginResponse) => {
            // Now upload documents
            const formData = new FormData();
            this.selectedFiles.forEach((file, key) => {
              formData.append(key, file);
            });

            this.onboardingService.uploadMyDocuments(formData).subscribe({
              next: (uploadResponse) => {
                this.success = true;
                this.loading = false;
                
                // Show success message with credentials
                setTimeout(() => {
                  this.router.navigate(['/login']);
                }, 5000);
              },
              error: (error) => {
                this.error = error.error?.message || 'Upload failed. You can upload documents later from your dashboard.';
                this.loading = false;
                this.success = true; // Still show success for account creation
              }
            });
          },
          error: (error) => {
            this.error = 'Account created but could not auto-upload documents. Please login and upload manually.';
            this.loading = false;
            this.success = true;
          }
        });
      },
      error: (error) => {
        this.error = error.error?.message || 'Application failed. Please try again.';
        this.loading = false;
      }
    });
  }

  get f() {
    return this.applyForm.controls;
  }
}
