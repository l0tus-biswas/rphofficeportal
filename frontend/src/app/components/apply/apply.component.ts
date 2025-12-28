import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PublicService } from '../../services/public.service';
import { BrandingService, BrandingConfig } from '../../services/branding.service';

@Component({
  selector: 'app-apply',
  templateUrl: './apply.component.html',
  styleUrls: ['./apply.component.css']
})
export class ApplyComponent implements OnInit {
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
  branding: BrandingConfig = { appName: 'Escape', appLogo: null };
  
  // For file uploads in section 3
  complianceFiles: Map<string, File> = new Map();
  
  // US States
  states = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];

  constructor(
    private formBuilder: FormBuilder,
    private publicService: PublicService,
    private route: ActivatedRoute,
    private router: Router,
    private brandingService: BrandingService
  ) {}

  ngOnInit(): void {
    // Load branding
    this.branding = this.brandingService.getCurrentBranding();
    this.brandingService.branding$.subscribe(branding => {
      this.branding = branding;
    });
    
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
      homeZipCode: ['', [Validators.required, Validators.pattern(/^\d{4,10}$/)]],
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
      recruiterEmail: [''],
      recruiterPhone: [''],
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
      licenseLife: [false],
      licenseHealth: [false],
      licenseOther: [false],
      statesLicensed: [''],
      licenseNumber: [''],
      licenseStatus: ['']
    });

    this.setupDynamicValidation();
  }

  setupDynamicValidation(): void {
    // Mailing address validation
    this.section1Form.get('hasDifferentMailing')?.valueChanges.subscribe(hasDifferent => {
      const mailingFields = ['mailingStreet', 'mailingCity', 'mailingState'];
      mailingFields.forEach(field => {
        const control = this.section1Form.get(field);
        if (hasDifferent) {
          control?.setValidators([Validators.required]);
        } else {
          control?.clearValidators();
        }
        control?.updateValueAndValidity();
      });      
      const mailingZipControl = this.section1Form.get('mailingZipCode');
      if (hasDifferent) {
        mailingZipControl?.setValidators([Validators.required, Validators.pattern(/^\d{4,10}$/)]);
      } else {
        mailingZipControl?.clearValidators();
      }
      mailingZipControl?.updateValueAndValidity();    });

    // Bankruptcy validation
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

    // Licensing validation
    this.section5Form.get('currentlyLicensed')?.valueChanges.subscribe(licensed => {
      const licenseFields = ['statesLicensed', 'licenseNumber', 'licenseStatus'];
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
      this.publicService.verifyReferralCode(this.referralCode).subscribe({
        next: (response) => {
          if (response.valid) {
            this.recruiterName = response.agent.name;
            this.invalidReferral = false;
            
            // Auto-fill section 2 with recruiter information
            this.section2Form.patchValue({
              recruiterFullName: response.agent.name,
              recruiterAgentId: response.agent.referralCode,
              recruiterEmail: response.agent.email || '',
              recruiterPhone: response.agent.phone || ''
            });
            
            // Make fields read-only since they're auto-filled
            this.section2Form.get('recruiterFullName')?.disable();
            this.section2Form.get('recruiterAgentId')?.disable();
            
            // Disable email/phone if they have values
            if (response.agent.email) {
              this.section2Form.get('recruiterEmail')?.disable();
            }
            if (response.agent.phone) {
              this.section2Form.get('recruiterPhone')?.disable();
            }
          } else {
            this.invalidReferral = true;
          }
        },
        error: () => this.invalidReferral = true
      });
    } else {
      this.invalidReferral = true;
    }
  }

  nextSection(): void {
    const currentForm = this.getCurrentForm();
    
    // Mark all fields as touched to show validation errors
    Object.keys(currentForm.controls).forEach(key => currentForm.get(key)?.markAsTouched());
    
    if (currentForm.invalid) {
      // Find which fields are invalid and create readable error messages
      const invalidFields = Object.keys(currentForm.controls)
        .filter(key => currentForm.get(key)?.invalid)
        .map(key => this.getFieldLabel(key));
      
      console.log('Invalid fields:', invalidFields);
      
      if (invalidFields.length > 0) {
        const fieldList = invalidFields.join(', ');
        this.error = `Please complete the following required field${invalidFields.length > 1 ? 's' : ''}: ${fieldList}`;
      } else {
        this.error = 'Please fill in all required fields correctly';
      }
      
      window.scrollTo(0, 0);
      return;
    }
    
    this.error = '';
    if (this.currentSection < this.totalSections) {
      this.currentSection++;
      window.scrollTo(0, 0);
    }
  }

  getFieldLabel(fieldName: string): string {
    const fieldLabels: { [key: string]: string } = {
      // Section 1
      'legalFirstName': 'Legal First Name',
      'legalLastName': 'Legal Last Name',
      'gender': 'Gender',
      'dateOfBirth': 'Date of Birth',
      'ssn': 'Social Security Number',
      'mobilePhone': 'Mobile Phone',
      'email': 'Email Address',
      'homeStreet': 'Home Street Address',
      'homeCity': 'Home City',
      'homeState': 'Home State',
      'homeZipCode': 'Home Zip Code',
      'mailingStreet': 'Mailing Street Address',
      'mailingCity': 'Mailing City',
      'mailingState': 'Mailing State',
      'mailingZipCode': 'Mailing Zip Code',
      
      // Section 2
      'recruiterFullName': 'Recruiter Full Name',
      'recruiterEmail': 'Recruiter Email',
      'recruiterPhone': 'Recruiter Phone',
      
      // Section 3 - compliance fields are optional
      
      // Section 4
      'unsatisfiedJudgments': 'Unsatisfied Judgments',
      'unsatisfiedLiens': 'Unsatisfied Liens',
      'bankruptcyFiled': 'Bankruptcy Status',
      'bankruptcyChapter': 'Bankruptcy Chapter',
      'bankruptcyStatus': 'Bankruptcy Resolution Status',
      
      // Section 5
      'currentlyLicensed': 'Current License Status',
      'statesLicensed': 'States Licensed In',
      'licenseNumber': 'License Number',
      'licenseStatus': 'License Status'
    };
    
    return fieldLabels[fieldName] || fieldName;
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
    if (file) this.complianceFiles.set(question, file);
  }

  submitApplication(): void {
    const allForms = [
      { form: this.section1Form, section: 1, name: 'Personal Information' },
      { form: this.section2Form, section: 2, name: 'Recruiting Information' },
      { form: this.section3Form, section: 3, name: 'Compliance Questions' },
      { form: this.section4Form, section: 4, name: 'Financial Background' },
      { form: this.section5Form, section: 5, name: 'Licensing Information' }
    ];
    
    let invalidSections: string[] = [];
    let allInvalidFields: string[] = [];
    let firstInvalidSection = -1;
    
    allForms.forEach(({ form, section, name }) => {
      if (form.invalid) {
        Object.keys(form.controls).forEach(key => form.get(key)?.markAsTouched());
        
        const invalidFields = Object.keys(form.controls)
          .filter(key => form.get(key)?.invalid)
          .map(key => this.getFieldLabel(key));
        
        if (invalidFields.length > 0) {
          invalidSections.push(`${name} (${invalidFields.join(', ')})`);
          allInvalidFields.push(...invalidFields);
          
          if (firstInvalidSection === -1) {
            firstInvalidSection = section;
          }
        }
      }
    });

    if (invalidSections.length > 0) {
      this.error = `Please complete the following: ${invalidSections.join(' | ')}`;
      this.currentSection = firstInvalidSection;
      window.scrollTo(0, 0);
      return;
    }

    this.loading = true;
    this.error = '';

    this.publicService.submitAPAApplication(this.buildApplicationData()).subscribe({
      next: (response) => {
        this.loading = false;
        if (response.docusignUrl) {
          alert('Application submitted! Redirecting to DocuSign to sign the APA agreement...');
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
    // Get raw values to include disabled fields
    const s1 = this.section1Form.value;
    const s2 = this.section2Form.getRawValue(); // Use getRawValue() to include disabled fields
    const s3 = this.section3Form.value;
    const s4 = this.section4Form.value;
    const s5 = this.section5Form.value;

    const licenseTypes = [];
    if (s5.licenseLife) licenseTypes.push('Life');
    if (s5.licenseHealth) licenseTypes.push('Health');
    if (s5.licenseOther) licenseTypes.push('Other');

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
        recruiterContact: s2.recruiterEmail || s2.recruiterPhone || '',
        uplineLeaderName: s2.uplineLeaderName,
        teamName: s2.teamName,
        referralCode: this.referralCode
      },
      complianceQuestions: {
        previouslyContractedOther: { answer: s3.previouslyContractedOther, explanation: s3.previouslyContractedOtherExplanation },
        felonyConviction: { answer: s3.felonyConviction, explanation: s3.felonyConvictionExplanation },
        misdemeanorFraud: { answer: s3.misdemeanorFraud, explanation: s3.misdemeanorFraudExplanation },
        civilAction: { answer: s3.civilAction, explanation: s3.civilActionExplanation },
        licenseDenied: { answer: s3.licenseDenied, explanation: s3.licenseDeniedExplanation },
        bondIssues: { answer: s3.bondIssues, explanation: s3.bondIssuesExplanation }
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
        licenseTypes: licenseTypes,
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
