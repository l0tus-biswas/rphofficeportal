import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormArray, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PublicService } from '../../services/public.service';

type SectionInfo = { form: FormGroup; section: number; name: string };

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
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.initializeForms();
    this.loadReferralInfo();
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
      recruiterEmail: ['', [Validators.required, Validators.email]],
      recruiterPhone: ['', Validators.required],
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
      unsatisfiedJudgmentsExplanation: [''],
      unsatisfiedLiens: [null, this.requiredBooleanValidator.bind(this)],
      unsatisfiedLiensExplanation: [''],
      bankruptcyFiled: [null, this.requiredBooleanValidator.bind(this)],
      bankruptcyChapter: [''],
      bankruptcyStatus: ['']
    });

    // Section 5: Licensing
    this.section5Form = this.formBuilder.group({
      currentlyLicensed: [null, this.requiredBooleanValidator.bind(this)],
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

    // Dynamic validation for unsatisfied judgments explanation
    this.section4Form.get('unsatisfiedJudgments')?.valueChanges.subscribe(hasJudgments => {
      const explanationControl = this.section4Form.get('unsatisfiedJudgmentsExplanation');
      if (hasJudgments) {
        explanationControl?.setValidators([Validators.required, Validators.minLength(10)]);
      } else {
        explanationControl?.clearValidators();
      }
      explanationControl?.updateValueAndValidity();
    });

    // Dynamic validation for unsatisfied liens explanation
    this.section4Form.get('unsatisfiedLiens')?.valueChanges.subscribe(hasLiens => {
      const explanationControl = this.section4Form.get('unsatisfiedLiensExplanation');
      if (hasLiens) {
        explanationControl?.setValidators([Validators.required, Validators.minLength(10)]);
      } else {
        explanationControl?.clearValidators();
      }
      explanationControl?.updateValueAndValidity();
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

    // Dynamic validation for compliance explanations
    const complianceFields = [
      { checkbox: 'previouslyContractedOther', explanation: 'previouslyContractedOtherExplanation' },
      { checkbox: 'felonyConviction', explanation: 'felonyConvictionExplanation' },
      { checkbox: 'misdemeanorFraud', explanation: 'misdemeanorFraudExplanation' },
      { checkbox: 'civilAction', explanation: 'civilActionExplanation' },
      { checkbox: 'licenseDenied', explanation: 'licenseDeniedExplanation' },
      { checkbox: 'bondIssues', explanation: 'bondIssuesExplanation' }
    ];

    complianceFields.forEach(field => {
      this.section3Form.get(field.checkbox)?.valueChanges.subscribe(checked => {
        const explanationControl = this.section3Form.get(field.explanation);
        if (checked) {
          explanationControl?.setValidators([Validators.required, Validators.minLength(10)]);
        } else {
          explanationControl?.clearValidators();
        }
        explanationControl?.updateValueAndValidity();
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
              recruiterEmail: response.agentEmail,
              recruiterPhone: response.agentPhone
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

  private getFieldLabel(section: number, fieldName: string): string {
    const sectionFieldLabels: Record<number, Record<string, string>> = {
      1: {
        legalFirstName: 'Legal First Name',
        legalMiddleName: 'Legal Middle Name',
        legalLastName: 'Legal Last Name',
        gender: 'Gender',
        dateOfBirth: 'Date of Birth',
        ssn: 'Social Security Number',
        mobilePhone: 'Mobile Phone',
        email: 'Email Address',
        homeStreet: 'Home Street Address',
        homeCity: 'Home City',
        homeState: 'Home State',
        homeZipCode: 'Home Zip Code',
        mailingStreet: 'Mailing Street Address',
        mailingCity: 'Mailing City',
        mailingState: 'Mailing State',
        mailingZipCode: 'Mailing Zip Code'
      },
      2: {
        recruiterFullName: 'Recruiter Full Name',
        recruiterAgentId: 'Recruiter Agent ID',
        recruiterEmail: 'Recruiter Email',
        recruiterPhone: 'Recruiter Phone',
        uplineLeaderName: 'Upline Leader Name',
        teamName: 'Team Name'
      },
      3: {
        previouslyContractedOtherExplanation: 'Previous Contract Explanation',
        felonyConvictionExplanation: 'Felony Conviction Explanation',
        misdemeanorFraudExplanation: 'Misdemeanor Fraud Explanation',
        civilActionExplanation: 'Civil Action Explanation',
        licenseDeniedExplanation: 'License Denial Explanation',
        bondIssuesExplanation: 'Bond Issues Explanation'
      },
      4: {
        unsatisfiedJudgments: 'Unsatisfied Judgments',
        unsatisfiedLiens: 'Unsatisfied Tax Liens',
        bankruptcyFiled: 'Bankruptcy History',
        bankruptcyChapter: 'Bankruptcy Chapter',
        bankruptcyStatus: 'Bankruptcy Status'
      },
      5: {
        currentlyLicensed: 'Currently Licensed',
        licenseTypes: 'License Types',
        statesLicensed: 'States Licensed',
        licenseNumber: 'License Number',
        licenseStatus: 'License Status'
      }
    };

    return sectionFieldLabels[section]?.[fieldName] || this.formatFieldName(fieldName);
  }

  private formatFieldName(fieldName: string): string {
    return fieldName
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, (char) => char.toUpperCase());
  }

  private logFormsSnapshot(context: string): void {
    console.log(`=== Form Snapshot: ${context} ===`);
    console.log('Section 1 form values:', this.section1Form?.value);
    console.log('Section 2 form values:', this.section2Form?.value);
    console.log('Section 3 form values:', this.section3Form?.value);
    console.log('Section 4 form values:', this.section4Form?.value);
    console.log('Section 5 form values:', this.section5Form?.value);
  }

  nextSection(): void {
    const currentForm = this.getCurrentForm();
    
    console.log('=== NEXT SECTION CLICKED ===');
    console.log('Current section:', this.currentSection);
    console.log('Form value:', currentForm.value);

    this.logFormsSnapshot(`before navigating from section ${this.currentSection}`);
    
    // Mark all fields as touched to trigger validation display
    Object.keys(currentForm.controls).forEach(key => {
      const control = currentForm.get(key);
      if (control) {
        control.markAsTouched();
        control.markAsDirty();
        control.updateValueAndValidity();
      }
    });
    
    // Force Angular to detect changes
    this.cdr.detectChanges();
    
    console.log('Form valid?', currentForm.valid);
    console.log('Form invalid?', currentForm.invalid);
    
    // Check if form is invalid
    if (currentForm.invalid) {
      const invalidFields = Object.keys(currentForm.controls)
        .filter(key => currentForm.get(key)?.invalid)
        .map(key => this.getFieldLabel(this.currentSection, key));

      const uniqueFields = Array.from(new Set(invalidFields));

      console.log('❌ INVALID FIELDS:', uniqueFields);

      if (uniqueFields.length > 0) {
        const fieldList = uniqueFields.join(', ');
        this.error = `Please complete the following required field${uniqueFields.length > 1 ? 's' : ''}: ${fieldList}`;
      } else if (this.currentSection === 4) {
        this.error = 'Please answer all Financial Background questions (select Yes or No for each)';
      } else if (this.currentSection === 5) {
        this.error = 'Please answer the Licensing question (select Yes or No)';
      } else {
        this.error = 'Please fill in all required fields before continuing';
      }

      window.scrollTo(0, 0);
      return; // STOP HERE - do not proceed
    }
    
    // Form is valid - proceed to next section
    console.log('Section', this.currentSection, 'is VALID - moving to next');
    this.error = '';
    if (this.currentSection < this.totalSections) {
      this.currentSection++;
      this.cdr.detectChanges();
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

  onLicenseTypeChange(event: any): void {
    const licenseTypesArray = this.section5Form.get('licenseTypes') as FormArray;
    const value = event.target.value;
    
    if (event.target.checked) {
      // Add the license type if checked
      if (!licenseTypesArray.value.includes(value)) {
        licenseTypesArray.push(this.formBuilder.control(value));
      }
    } else {
      // Remove the license type if unchecked
      const index = licenseTypesArray.value.indexOf(value);
      if (index >= 0) {
        licenseTypesArray.removeAt(index);
      }
    }
    
    // Trigger validation
    licenseTypesArray.markAsTouched();
    licenseTypesArray.updateValueAndValidity();
  }

  onFileSelected(question: string, event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.complianceFiles.set(question, file);
    }
  }

  submitApplication(): void {
    this.logFormsSnapshot('on submit');

    // Validate all forms and find first section with errors
    const allForms: SectionInfo[] = [
      { form: this.section1Form, section: 1, name: 'Personal Information' },
      { form: this.section2Form, section: 2, name: 'Recruiting Information' },
      { form: this.section3Form, section: 3, name: 'Compliance Questions' },
      { form: this.section4Form, section: 4, name: 'Financial Background' },
      { form: this.section5Form, section: 5, name: 'Licensing Information' }
    ];
    
    let firstErrorSection: SectionInfo | null = null;
    let firstSectionInvalidFields: string[] = [];
    let hasErrors = false;
    
    allForms.forEach(formObj => {
      // Mark controls as touched before checking validity
      Object.keys(formObj.form.controls).forEach(key => {
        formObj.form.get(key)?.markAsTouched();
      });
      formObj.form.updateValueAndValidity();

      if (formObj.form.invalid) {
        hasErrors = true;

        // Track first section with errors
        if (!firstErrorSection) {
          firstErrorSection = formObj;

          // Collect human-readable field labels for the error message
          const invalidFields = Object.keys(formObj.form.controls)
            .filter(key => formObj.form.get(key)?.invalid)
            .map(key => this.getFieldLabel(formObj.section, key));

          firstSectionInvalidFields = Array.from(new Set(invalidFields));

          console.log(`Section ${formObj.section} (${formObj.name}) has invalid fields:`, firstSectionInvalidFields);
        }
      }
    });

    if (hasErrors && firstErrorSection) {
      const targetSection = firstErrorSection as SectionInfo;
      if (firstSectionInvalidFields.length > 0) {
        const fieldList = firstSectionInvalidFields.join(', ');
        this.error = `Please complete the following required field${firstSectionInvalidFields.length > 1 ? 's' : ''}: ${fieldList}`;
      } else {
        this.error = `Please complete all required fields in ${targetSection.name}`;
      }
      this.currentSection = targetSection.section;
      window.scrollTo(0, 0);
      return;
    }

    this.loading = true;
    this.error = '';

    const applicationData = this.buildApplicationData();
    
    // Debug: Log form values before submission
    console.log('Section 4 Form Values:', this.section4Form.value);
    console.log('Section 5 Form Values:', this.section5Form.value);
    console.log('Application Data being submitted:', JSON.stringify(applicationData, null, 2));

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
        recruiterContact: s2.recruiterEmail || s2.recruiterPhone,
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
        unsatisfiedJudgmentsExplanation: s4.unsatisfiedJudgmentsExplanation,
        unsatisfiedLiens: s4.unsatisfiedLiens,
        unsatisfiedLiensExplanation: s4.unsatisfiedLiensExplanation,
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
