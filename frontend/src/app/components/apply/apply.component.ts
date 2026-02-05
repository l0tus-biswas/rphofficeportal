import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PublicService } from '../../services/public.service';
import { BrandingService, BrandingConfig } from '../../services/branding.service';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

declare const google: any;

interface RecruiterSearchResult {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  referralCode: string;
  role?: string;
  level?: string;
}

@Component({
  selector: 'app-apply',
  templateUrl: './apply.component.html',
  styleUrls: ['./apply.component.css']
})
export class ApplyComponent implements OnInit, OnDestroy {
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
  recruiterFieldsLocked = false;
  recruiterLookupState: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  recruiterLookupMessage = '';
  recruiterSearchResults: RecruiterSearchResult[] = [];
  recruiterSearchLoading = false;
  recruiterSearchError = '';
  invalidReferral = false;
  branding: BrandingConfig = { appName: 'RHP Office', appLogo: null };
  showInstructions = false;
  docusignUrl = '';
  isPendingSignature = false;
  existingApplicationId = '';
  
  // For file uploads in section 3
  complianceFiles: Map<string, File> = new Map();

  // Language toggle
  languages = [
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Español' }
  ];
  currentLanguage = 'en';
  private translationInitAttempts = 0;
  
  // US States
  states = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];
  private readonly recruiterFieldKeys = ['recruiterFullName', 'recruiterAgentId', 'recruiterEmail', 'recruiterPhone'];
  private recruiterSearch$ = new Subject<string>();
  private subscriptions: Subscription[] = [];
  readonly sectionMeta = [
    { id: 1, label: 'Personal Info', icon: 'bi-person-badge' },
    { id: 2, label: 'Recruiting', icon: 'bi-diagram-3' },
    { id: 3, label: 'Compliance', icon: 'bi-shield-check' },
    { id: 4, label: 'Financial', icon: 'bi-cash-coin' },
    { id: 5, label: 'Licensing', icon: 'bi-award' }
  ];

  constructor(
    private formBuilder: FormBuilder,
    private publicService: PublicService,
    private route: ActivatedRoute,
    private router: Router,
    private brandingService: BrandingService
  ) {}

  ngOnInit(): void {
    this.currentLanguage = localStorage.getItem('selectedLanguage') || 'en';
    this.initTranslationSupport();

    // Load branding
    this.branding = this.brandingService.getCurrentBranding();
    this.brandingService.branding$.subscribe(branding => {
      this.branding = branding;
    });
    
    this.initializeForms();
    this.loadReferralInfo();
    this.checkExistingApplication();
    this.initRecruiterSearchStream();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.recruiterSearch$.complete();
  }

  // Custom validator for boolean radio buttons (Yes/No)
  private requiredBooleanValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    // Must be explicitly true or false, not null, undefined, or empty string
    if (value !== true && value !== false) {
      return { required: true };
    }
    return null;
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
      unsatisfiedJudgments: [null, this.requiredBooleanValidator.bind(this)],
      unsatisfiedLiens: [null, this.requiredBooleanValidator.bind(this)],
      bankruptcyFiled: [null, this.requiredBooleanValidator.bind(this)],
      bankruptcyChapter: [''],
      bankruptcyStatus: ['']
    });

    // Section 5: Licensing
    this.section5Form = this.formBuilder.group({
      currentlyLicensed: [null, this.requiredBooleanValidator.bind(this)],
      licenseLife: [false],
      licenseHealth: [false],
      licenseLifeHealth: [false],
      licenseOther: [false],
      licenseOtherDescription: [''],
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

    const licenseOtherControl = this.section5Form.get('licenseOther');
    const descriptionControl = this.section5Form.get('licenseOtherDescription');
    const syncLicenseOtherValidation = (selectedOther: boolean) => {
      if (selectedOther) {
        descriptionControl?.setValidators([Validators.required, Validators.minLength(3)]);
      } else {
        descriptionControl?.clearValidators();
        descriptionControl?.setValue('', { emitEvent: false });
      }
      descriptionControl?.updateValueAndValidity();
    };
    syncLicenseOtherValidation(!!licenseOtherControl?.value);
    licenseOtherControl?.valueChanges.subscribe(selected => syncLicenseOtherValidation(!!selected));
  }

  checkExistingApplication(): void {
    const emailControl = this.section1Form.get('email');
    if (!emailControl) {
      return;
    }

    emailControl.valueChanges.subscribe(email => {
      this.lookupPendingApplication(email);
    });

    this.section2Form.get('recruiterAgentId')?.valueChanges.subscribe(() => {
      const currentEmail = emailControl.value;
      this.lookupPendingApplication(currentEmail);
    });
  }

  private lookupPendingApplication(email: string | null | undefined): void {
    const normalizedEmail = (email || '').trim();
    const referralCode = this.getSelectedReferralCode();
    this.clearPendingSignatureState();

    if (!normalizedEmail || !normalizedEmail.includes('@') || !referralCode) {
      return;
    }

    this.publicService.checkPendingApplication(normalizedEmail, referralCode).subscribe({
      next: (response: any) => {
        if (response.application && response.application.status === 'pending_signature') {
          this.isPendingSignature = true;
          this.existingApplicationId = response.application._id;
          this.docusignUrl = response.application.docusignUrl || '';
          console.log('Found pending signature application:', this.existingApplicationId);
        }
      },
      error: (err) => {
        console.log('No existing application found or error:', err);
      }
    });
  }

  private clearPendingSignatureState(): void {
    this.isPendingSignature = false;
    this.existingApplicationId = '';
    this.docusignUrl = '';
  }

  private initRecruiterSearchStream(): void {
    const sub = this.recruiterSearch$
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(query => this.handleRecruiterSearch(query));
    this.subscriptions.push(sub);
  }

  private handleRecruiterSearch(query: string): void {
    if (this.recruiterFieldsLocked) {
      this.clearRecruiterSearchState();
      return;
    }

    const normalizedQuery = (query || '').trim();
    if (normalizedQuery.length < 2) {
      this.clearRecruiterSearchState();
      return;
    }

    this.recruiterSearchLoading = true;
    this.recruiterSearchError = '';

    this.publicService.searchRecruiters(normalizedQuery).subscribe({
      next: (response) => {
        this.recruiterSearchLoading = false;
        this.recruiterSearchResults = response.results || [];
      },
      error: () => {
        this.recruiterSearchLoading = false;
        this.recruiterSearchResults = [];
        this.recruiterSearchError = 'Unable to search recruiters right now. Please try again.';
      }
    });
  }

  private clearRecruiterSearchState(): void {
    this.recruiterSearchResults = [];
    this.recruiterSearchLoading = false;
    this.recruiterSearchError = '';
  }

  selectRecruiter(result: RecruiterSearchResult): void {
    if (this.recruiterFieldsLocked) {
      return;
    }

    this.section2Form.patchValue({
      recruiterFullName: result.name,
      recruiterAgentId: result.referralCode,
      recruiterEmail: result.email || '',
      recruiterPhone: result.phone || ''
    });

    this.recruiterLookupState = 'success';
    this.recruiterLookupMessage = `Recruiter ${result.name} selected.`;
    this.clearRecruiterSearchState();
    this.lookupPendingApplication(this.section1Form.get('email')?.value);
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
            
            this.setRecruiterFieldsLockedState(true);
            this.recruiterLookupState = 'success';
            this.recruiterLookupMessage = 'Recruiter info auto-filled from referral link.';
          } else {
            this.invalidReferral = true;
            this.setRecruiterFieldsLockedState(false);
          }
        },
        error: () => {
          this.invalidReferral = true;
          this.setRecruiterFieldsLockedState(false);
          this.recruiterLookupState = 'idle';
          this.recruiterLookupMessage = '';
        }
      });
    } else {
      this.invalidReferral = true;
      this.setRecruiterFieldsLockedState(false);
    }
  }

  nextSection(): void {
    const currentForm = this.getCurrentForm();
    
    console.log('=== NEXT SECTION CLICKED ===');
    console.log('Current section:', this.currentSection);
    console.log('Form value:', currentForm.value);
    
    this.logFormsSnapshot(`before navigating from section ${this.currentSection}`);
    
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

  private logFormsSnapshot(context: string): void {
    console.log(`=== Form Snapshot: ${context} ===`);
    console.log('Section 1 form values:', this.section1Form?.value);
    console.log('Section 2 form values:', this.section2Form?.getRawValue());
    console.log('Section 3 form values:', this.section3Form?.value);
    console.log('Section 4 form values:', this.section4Form?.value);
    console.log('Section 5 form values:', this.section5Form?.value);
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
    this.logFormsSnapshot('on submit');
    
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
        // Navigate to success page with applicant info
        const applicantName = `${this.section1Form.value.legalFirstName} ${this.section1Form.value.legalLastName}`;
        this.router.navigate(['/application-success'], { 
          queryParams: { 
            applicationId: response.applicationId,
            name: applicantName
          } 
        });
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
    const selectedReferralCode = this.getSelectedReferralCode();
    const normalizedRecruiterAgentId = this.normalizeReferralCode(s2.recruiterAgentId);

    const licenseTypes = [];
    if (s5.licenseLife) licenseTypes.push('Life');
    if (s5.licenseHealth) licenseTypes.push('Health');
    if (s5.licenseLifeHealth) licenseTypes.push('Life & Health');
    if (s5.licenseOther) licenseTypes.push('Other');
    const licenseOtherDescription = s5.licenseOther ? (s5.licenseOtherDescription || '').trim() : '';

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
        recruiterFullName: s2.recruiterFullName?.trim(),
        recruiterAgentId: normalizedRecruiterAgentId,
        recruiterContact: this.getRecruiterContactValue(s2),
        uplineLeaderName: s2.uplineLeaderName,
        teamName: s2.teamName,
        referralCode: selectedReferralCode
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
        licenseStatus: s5.licenseStatus,
        licenseOtherDescription: licenseOtherDescription || undefined
      }
    };
  }

  unlockRecruiterFields(): void {
    this.setRecruiterFieldsLockedState(false);
    this.recruiterLookupState = 'idle';
    this.recruiterLookupMessage = '';
  }

  onRecruiterAgentIdInput(): void {
    this.recruiterLookupState = 'idle';
    this.recruiterLookupMessage = '';
    this.clearPendingSignatureState();
  }

  onRecruiterAgentIdBlur(): void {
    const control = this.section2Form.get('recruiterAgentId');
    if (!control) {
      return;
    }

    const normalizedValue = this.normalizeReferralCode(control.value);
    if (control.value !== normalizedValue) {
      control.setValue(normalizedValue, { emitEvent: false });
    }

    if (!normalizedValue) {
      return;
    }

    this.recruiterLookupState = 'loading';
    this.recruiterLookupMessage = '';

    this.publicService.verifyReferralCode(normalizedValue).subscribe({
      next: (response) => {
        this.recruiterLookupState = 'success';
        this.recruiterLookupMessage = `Recruiter ${response.agent.name} selected.`;
        this.section2Form.patchValue({
          recruiterFullName: response.agent.name,
          recruiterEmail: response.agent.email || '',
          recruiterPhone: response.agent.phone || ''
        });
      },
      error: () => {
        this.recruiterLookupState = 'error';
        this.recruiterLookupMessage = 'Recruiter not found. Please verify the ID.';
      }
    });
  }

  private getRecruiterContactValue(section2: any): string {
    const email = section2.recruiterEmail?.trim();
    const phone = section2.recruiterPhone?.trim();
    if (email) {
      return email;
    }
    if (phone) {
      return phone;
    }
    return '';
  }

  private normalizeReferralCode(value: string | null | undefined): string {
    if (!value) {
      return '';
    }
    return value.toString().trim().toUpperCase();
  }

  private getSelectedReferralCode(): string {
    // Use getRawValue to get the form value even when field is disabled (locked)
    // Priority: form's recruiterAgentId (if filled) > URL referralCode
    const formValues = this.section2Form?.getRawValue();
    const manualCode = this.normalizeReferralCode(formValues?.recruiterAgentId);
    if (manualCode) {
      return manualCode;
    }
    return this.normalizeReferralCode(this.referralCode);
  }

  private setRecruiterFieldsLockedState(locked: boolean): void {
    this.recruiterFieldsLocked = locked;
    if (!this.section2Form) {
      return;
    }
    if (locked) {
      this.clearRecruiterSearchState();
    }
    this.recruiterFieldKeys.forEach(field => {
      const control = this.section2Form.get(field);
      if (!control) {
        return;
      }
      if (locked) {
        control.disable({ emitEvent: false });
      } else {
        control.enable({ emitEvent: false });
      }
    });
  }

  get progressPercentage(): number {
    return (this.currentSection / this.totalSections) * 100;
  }

  showSigningInstructions(url: string): void {
    this.docusignUrl = url;
    this.showInstructions = true;
    window.scrollTo(0, 0);
  }

  proceedToDocuSign(): void {
    console.log('Proceeding to DocuSign URL:', this.docusignUrl);
    if (this.docusignUrl) {
      window.location.href = this.docusignUrl;
    } else {
      alert('DocuSign URL not available. Please contact support.');
    }
  }

  resumeSigning(): void {
    console.log('Resuming signing for application:', this.existingApplicationId);
    if (this.docusignUrl) {
      // If we have the URL, redirect directly
      window.location.href = this.docusignUrl;
    } else if (this.existingApplicationId) {
      // Otherwise, request a new signing URL
      this.loading = true;
      this.publicService.resendDocuSign(this.existingApplicationId).subscribe({
        next: (response: any) => {
          this.loading = false;
          console.log('DocuSign resend response:', response);
          if (response.signingUrl) {
            window.location.href = response.signingUrl;
          } else {
            this.error = 'Unable to generate signing link. Please contact support.';
          }
        },
        error: (err) => {
          this.loading = false;
          console.error('Error resending DocuSign:', err);
          this.error = 'Failed to generate signing link. Please try again or contact support.';
        }
      });
    } else {
      this.error = 'Application information not available. Please contact support.';
    }
  }

  changeLanguage(lang: string): void {
    if (this.currentLanguage === lang) {
      return;
    }

    this.currentLanguage = lang;
    if (lang === 'en') {
      localStorage.removeItem('selectedLanguage');
    } else {
      localStorage.setItem('selectedLanguage', lang);
    }

    this.triggerLanguageChange(lang);
  }

  isLanguageActive(lang: string): boolean {
    return this.currentLanguage === lang;
  }

  private initTranslationSupport(): void {
    const win = window as any;
    if (win?._rhpGoogleTranslateInitialized) {
      this.triggerLanguageChange(this.currentLanguage, true);
      return;
    }

    const initialize = () => {
      // Check if both google and TranslateElement are available
      if (typeof google !== 'undefined' && 
          google.translate && 
          typeof google.translate.TranslateElement === 'function') {
        try {
          let container = document.getElementById('google_translate_element_hidden');
          if (!container) {
            container = document.createElement('div');
            container.id = 'google_translate_element_hidden';
            container.style.display = 'none';
            document.body.appendChild(container);
          }

          new google.translate.TranslateElement(
            {
              pageLanguage: 'en',
              includedLanguages: this.languages.map(l => l.code).join(','),
              autoDisplay: false
            },
            'google_translate_element_hidden'
          );

          win._rhpGoogleTranslateInitialized = true;
          this.triggerLanguageChange(this.currentLanguage, true);
        } catch (error) {
          console.error('Google Translate initialization failed:', error);
        }
      } else if (this.translationInitAttempts < 20) {
        this.translationInitAttempts += 1;
        console.log(`Google Translate not ready, attempt ${this.translationInitAttempts}/20`);
        setTimeout(initialize, 300);
      }
    };

    initialize();
  }

  private triggerLanguageChange(lang: string, silent = false, attempt = 0): void {
    const selectElement = document.querySelector('.goog-te-combo') as HTMLSelectElement | null;

    if (selectElement) {
      selectElement.value = lang;
      selectElement.dispatchEvent(new Event('change'));
    } else if (attempt < 20) {
      setTimeout(() => this.triggerLanguageChange(lang, silent, attempt + 1), 250);
    }
  }
}
