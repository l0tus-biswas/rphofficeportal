import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PublicService } from '../../services/public.service';

@Component({
  selector: 'app-apa-apply',
  templateUrl: './apa-apply.component.html',
  styleUrls: ['./apa-apply.component.css']
})
export class ApaApplyComponent implements OnInit {
  currentSection = 1;
  totalSections = 5;
  
  // Forms for each section
  section1Form!: FormGroup;
  section2Form!: FormGroup;
  section3Form!: FormGroup;
  section4Form!: FormGroup;
  section5Form!: FormGroup;
  
  loading = false;
  error = '';
  referralCode = '';
  recruiterName = '';
  invalidReferral = false;
  
  // For file uploads in section 3
  complianceFiles: Map<string, File> = new Map();
  
  constructor(
    private formBuilder: FormBuilder,
    private publicService: PublicService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initializeForms();
    this.loadReferralInfo();
  }

  initializeForms(): void {
    // Section 1: Personal Information
    this.section1Form = this.formBuilder.group({
      legalFirstName: ['', [Validators.required, Validators.minLength(2)]],
      legalMiddleName: [''],
      legalLastName: ['', [Validators.required, Validators.minLength(2)]],
      gender: ['', Validators.required],
      dateOfBirth: ['', Validators.required],
      ssn: ['', [Validators.required, Validators.pattern(/^\d{3}-?\d{2}-?\d{4}$/)]],
      mobilePhone: ['', [Validators.required, Validators.minLength(10)]],
      email: ['', [Validators.required, Validators.email]],
      homeStreet: ['', Validators.required],
      homeCity: ['', Validators.required],
      homeState: ['', Validators.required],
      homeZipCode: ['', [Validators.required, Validators.pattern(/^\d{5}(-\d{4})?$/)]],
      hasDifferentMailing: [false],
      mailingStreet: [''],
      mailingCity: [''],
      mailingState: [''],
      mailingZipCode: [''],
      previouslyContracted: [false]
    });

    // Section 2: Recruiting Info
    this.section2Form = this.formBuilder.group({
      recruiterFullName: ['', Validators.required],
      recruiterAgentId: [''],
      recruiterContact: ['', Validators.required],
      uplineLeaderName: [''],
      teamName: ['']
    });

    // Section 3: Compliance
    this.section3Form = this.formBuilder.group({
      previouslyContractedOther: [false],
      previouslyContractedOtherExplanation: [''],
      felonyConviction: [false],
      felonyConvictionExplanation: [''],
      misdemeanorFraud: [false],
      misdemeanorFraudExplanation: [''],
      civilAction: [false],
      civilActionExplanation: [''],
      licenseDenied: [false],
      licenseDeniedExplanation: [''],
      bondIssues: [false],
      bondIssuesExplanation: ['']
    });

    // Section 4: Financial
    this.section4Form = this.formBuilder.group({
      unsatisfiedJudgments: [null],
      unsatisfiedLiens: [null],
      bankruptcyFiled: [null],
      bankruptcyChapter: [''],
      bankruptcyStatus: ['']
    });

    // Section 5: Licensing
    this.section5Form = this.formBuilder.group({
      currentlyLicensed: [null],
      licenseTypes: this.formBuilder.array([]),
      statesLicensed: [''],
      licenseNumber: [''],
      licenseStatus: ['']
    });

    // Dynamic validation for mailing address
    this.section1Form.get('hasDifferentMailing')?.valueChanges.subscribe(hasDifferent => {
      const mailingFields = ['mailingStreet', 'mailingCity', 'mailingState', 'mailingZipCode'];
      mailingFields.forEach(field => {
        const control = this.section1Form.get(field);
        if (hasDifferent) {
          control?.setValidators([Validators.required]);
        } else {
          control?.clearValidators();
        }
        control?.updateValueAndValidity();
      });
    });

    // Dynamic validation for bankruptcy
    this.section4Form.get('bankruptcyFiled')?.valueChanges.subscribe(filed => {
      const bankruptcyFields = ['bankruptcyChapter', 'bankruptcyStatus'];
      bankruptcyFields.forEach(field => {
        const control = this.section4Form.get(field);
        if (filed) {
          control?.setValidators([Validators.required]);
        } else {
          control?.clearValidators();
        }
        control?.updateValueAndValidity();
      });
    });

    // Dynamic validation for licensing
    this.section5Form.get('currentlyLicensed')?.valueChanges.subscribe(licensed => {
      const licenseFields = ['licenseTypes', 'statesLicensed', 'licenseNumber', 'licenseStatus'];
      licenseFields.forEach(field => {
        const control = this.section5Form.get(field);
        if (licensed) {
          control?.setValidators([Validators.required]);
        } else {
          control?.clearValidators();
        }
        control?.updateValueAndValidity();
      });
    });
  }

  loadReferralInfo(): void {
    this.referralCode = this.route.snapshot.queryParams['ref'] || '';
    if (this.referralCode) {
      this.publicService.validateReferralCode(this.referralCode).subscribe({
        next: (response: any) => {
          if (response.valid) {
            this.recruiterName = response.agentName;
            this.section2Form.patchValue({
              recruiterFullName: response.agentName,
              recruiterContact: response.agentEmail || response.agentPhone
            });
          } else {
            this.invalidReferral = true;
            this.error = 'Invalid referral code';
          }
        },
        error: (error: any) => {
          this.invalidReferral = true;
          this.error = 'Could not validate referral code';
        }
      });
    }
  }

  nextSection(): void {
    const currentForm = this.getCurrentForm();
    
    // Mark all fields as touched to show validation errors
    Object.keys(currentForm.controls).forEach(key => {
      currentForm.get(key)?.markAsTouched();
    });
    
    if (currentForm.invalid) {
      // Find which fields are invalid for debugging
      const invalidFields = Object.keys(currentForm.controls)
        .filter(key => currentForm.get(key)?.invalid)
        .map(key => key);
      
      console.log('Invalid fields:', invalidFields);
      this.error = 'Please fill in all required fields correctly';
      window.scrollTo(0, 0);
      return;
    }
    
    this.error = '';
    if (this.currentSection < this.totalSections) {
      this.currentSection++;
      window.scrollTo(0, 0);
    }
  }

  previousSection(): void {
    if (this.currentSection > 1) {
      this.currentSection--;
      window.scrollTo(0, 0);
    }
  }

  getCurrentForm(): FormGroup {
    switch (this.currentSection) {
      case 1: return this.section1Form;
      case 2: return this.section2Form;
      case 3: return this.section3Form;
      case 4: return this.section4Form;
      case 5: return this.section5Form;
      default: return this.section1Form;
    }
  }

  onFileSelected(question: string, event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.complianceFiles.set(question, file);
    }
  }

  submitApplication(): void {
    // Validate all forms
    const allForms = [this.section1Form, this.section2Form, this.section3Form, this.section4Form, this.section5Form];
    let hasErrors = false;
    
    allForms.forEach(form => {
      if (form.invalid) {
        Object.keys(form.controls).forEach(key => {
          form.get(key)?.markAsTouched();
        });
        hasErrors = true;
      }
    });

    if (hasErrors) {
      this.error = 'Please complete all required sections';
      this.currentSection = 1; // Go back to first section with errors
      return;
    }

    this.loading = true;
    this.error = '';

    const applicationData = this.buildApplicationData();

    this.publicService.submitAPAApplication(applicationData).subscribe({
      next: (response) => {
        this.loading = false;
        // Redirect to DocuSign or confirmation page
        if (response.docusignUrl) {
          window.location.href = response.docusignUrl;
        } else {
          this.router.navigate(['/application-submitted'], { 
            queryParams: { applicationId: response.applicationId } 
          });
        }
      },
      error: (error) => {
        this.loading = false;
        this.error = error.error?.message || 'Failed to submit application. Please try again.';
      }
    });
  }

  buildApplicationData(): any {
    const s1 = this.section1Form.value;
    const s2 = this.section2Form.value;
    const s3 = this.section3Form.value;
    const s4 = this.section4Form.value;
    const s5 = this.section5Form.value;

    return {
      personalInfo: {
        legalFirstName: s1.legalFirstName,
        legalMiddleName: s1.legalMiddleName,
        legalLastName: s1.legalLastName,
        gender: s1.gender,
        dateOfBirth: s1.dateOfBirth,
        ssn: s1.ssn,
        mobilePhone: s1.mobilePhone,
        email: s1.email,
        homeAddress: {
          street: s1.homeStreet,
          city: s1.homeCity,
          state: s1.homeState,
          zipCode: s1.homeZipCode
        },
        mailingAddress: s1.hasDifferentMailing ? {
          street: s1.mailingStreet,
          city: s1.mailingCity,
          state: s1.mailingState,
          zipCode: s1.mailingZipCode
        } : null,
        previouslyContracted: s1.previouslyContracted
      },
      recruitingInfo: {
        recruiterFullName: s2.recruiterFullName,
        recruiterAgentId: s2.recruiterAgentId,
        recruiterContact: s2.recruiterContact,
        uplineLeaderName: s2.uplineLeaderName,
        teamName: s2.teamName,
        referralCode: this.referralCode
      },
      complianceQuestions: {
        previouslyContractedOther: {
          answer: s3.previouslyContractedOther,
          explanation: s3.previouslyContractedOtherExplanation
        },
        felonyConviction: {
          answer: s3.felonyConviction,
          explanation: s3.felonyConvictionExplanation
        },
        misdemeanorFraud: {
          answer: s3.misdemeanorFraud,
          explanation: s3.misdemeanorFraudExplanation
        },
        civilAction: {
          answer: s3.civilAction,
          explanation: s3.civilActionExplanation
        },
        licenseDenied: {
          answer: s3.licenseDenied,
          explanation: s3.licenseDeniedExplanation
        },
        bondIssues: {
          answer: s3.bondIssues,
          explanation: s3.bondIssuesExplanation
        }
      },
      financialBackground: {
        unsatisfiedJudgments: s4.unsatisfiedJudgments,
        unsatisfiedLiens: s4.unsatisfiedLiens,
        bankruptcy: {
          filed: s4.bankruptcyFiled,
          chapter: s4.bankruptcyChapter,
          status: s4.bankruptcyStatus
        }
      },
      licensingStatus: {
        currentlyLicensed: s5.currentlyLicensed,
        licenseTypes: s5.licenseTypes,
        statesLicensed: s5.statesLicensed ? s5.statesLicensed.split(',').map((s: string) => s.trim()) : [],
        licenseNumber: s5.licenseNumber,
        licenseStatus: s5.licenseStatus
      }
    };
  }

  get progressPercentage(): number {
    return (this.currentSection / this.totalSections) * 100;
  }
}
