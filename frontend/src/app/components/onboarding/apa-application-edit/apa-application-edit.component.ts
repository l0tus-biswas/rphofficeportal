import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ApaEditService } from '../../../services/apa-edit.service';

@Component({
  selector: 'app-apa-application-edit',
  templateUrl: './apa-application-edit.component.html',
  styleUrls: ['./apa-application-edit.component.css']
})
export class ApaApplicationEditComponent implements OnInit {
  form!: FormGroup;
  loading = true;
  saving = false;
  error = '';
  success = '';
  unlocked = false;
  saved = false;
  rejected = false;
  rejectionReason = '';
  // After a save the agent must sign the updated agreement again.
  awaitingSignature = false;
  resending = false;
  maskedSsn = '';
  private original: any = {};

  licenseTypeOptions = ['Life', 'Health', 'Life & Health', 'Other'];
  licenseStatusOptions = ['Active', 'Inactive', 'Pending Renewal', 'Expired'];
  selectedLicenseTypes: string[] = [];

  complianceQuestions = [
    { key: 'previouslyContractedOther', label: 'Have you previously been contracted or employed with another insurance company, Broker Dealer, Investment Adviser, or any other financial services company?' },
    { key: 'felonyConviction', label: 'Have you ever been convicted of a felony?' },
    { key: 'misdemeanorFraud', label: 'Have you ever been convicted of a misdemeanor involving fraud, dishonesty, theft, breach of fiduciary duty, or any crime involving money or securities?' },
    { key: 'civilAction', label: 'Have you been a defendant in any civil action, or been the subject of an administrative or regulatory action or proceeding, including before the SEC, FINRA, SIPC, or any state regulatory agency?' },
    { key: 'licenseDenied', label: 'Have you ever had any professional or business license (insurance or otherwise) denied, suspended, or revoked?' },
    { key: 'bondIssues', label: 'Has a bonding company ever denied, paid out on, or revoked a surety bond for you?' }
  ];

  constructor(
    private fb: FormBuilder,
    private apaEditService: ApaEditService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.apaEditService.getApplication().subscribe({
      next: (res: any) => {
        const app = res.application;
        // Editing opens when an admin approved an edit request, or rejected the
        // application (the agent corrects it, signs again and resubmits).
        this.rejected = app?.status === 'rejected';
        this.rejectionReason = app?.rejectionReason || '';
        this.awaitingSignature = app?.status === 'pending_resignature';
        this.unlocked = app?.editRequest?.status === 'approved' || this.rejected;
        if (this.unlocked) this.populate(app);
        this.loading = false;
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to load your application';
        this.loading = false;
      }
    });
  }

  private buildForm(): void {
    const compliance: Record<string, any> = {};
    this.complianceQuestions.forEach(q => {
      compliance[q.key] = [false];
      compliance[q.key + 'Explanation'] = [''];
    });

    this.form = this.fb.group({
      legalFirstName: ['', [Validators.required, Validators.minLength(2)]],
      legalMiddleName: [''],
      legalLastName: ['', [Validators.required, Validators.minLength(2)]],
      agencyLegalName: [''],
      gender: ['', Validators.required],
      dateOfBirth: ['', Validators.required],
      ssn: ['', Validators.pattern(/^\d{3}-?\d{2}-?\d{4}$/)],
      mobilePhone: ['', [Validators.required, Validators.minLength(10)]],
      email: [{ value: '', disabled: true }],
      homeStreet: ['', Validators.required],
      homeCity: ['', Validators.required],
      homeState: ['', Validators.required],
      homeZipCode: ['', [Validators.required, Validators.pattern(/^\d{5}(-\d{4})?$/)]],
      hasDifferentMailing: [false],
      mailingStreet: [''],
      mailingCity: [''],
      mailingState: [''],
      mailingZipCode: [''],
      previouslyContracted: [false],

      recruiterFullName: [{ value: '', disabled: true }],
      recruiterAgentId: [{ value: '', disabled: true }],
      recruiterContact: [{ value: '', disabled: true }],
      uplineLeaderName: [{ value: '', disabled: true }],
      teamName: [{ value: '', disabled: true }],
      referralCode: [{ value: '', disabled: true }],

      ...compliance,

      unsatisfiedJudgments: [false],
      unsatisfiedJudgmentsExplanation: [''],
      unsatisfiedLiens: [false],
      unsatisfiedLiensExplanation: [''],
      bankruptcyFiled: [false],
      bankruptcyChapter: [''],
      bankruptcyStatus: [''],

      currentlyLicensed: [false],
      statesLicensed: [''],
      licenseNumber: [''],
      licenseStatus: [''],
      licenseOtherDescription: ['']
    });
  }

  private populate(app: any): void {
    const p = app.personalInfo || {};
    const r = app.recruitingInfo || {};
    const c = app.complianceQuestions || {};
    const f = app.financialBackground || {};
    const l = app.licensingStatus || {};

    this.maskedSsn = p.ssn ? `***-**-${String(p.ssn).slice(-4)}` : '';
    this.selectedLicenseTypes = [...(l.licenseTypes || [])];

    const patch: Record<string, any> = {
      legalFirstName: p.legalFirstName || '',
      legalMiddleName: p.legalMiddleName || '',
      legalLastName: p.legalLastName || '',
      agencyLegalName: p.agencyLegalName === 'N/A' ? '' : (p.agencyLegalName || ''),
      gender: p.gender || '',
      dateOfBirth: p.dateOfBirth ? String(p.dateOfBirth).substring(0, 10) : '',
      mobilePhone: p.mobilePhone || '',
      email: p.email || '',
      homeStreet: p.homeAddress?.street || '',
      homeCity: p.homeAddress?.city || '',
      homeState: p.homeAddress?.state || '',
      homeZipCode: p.homeAddress?.zipCode || '',
      hasDifferentMailing: !!p.mailingAddress?.street,
      mailingStreet: p.mailingAddress?.street || '',
      mailingCity: p.mailingAddress?.city || '',
      mailingState: p.mailingAddress?.state || '',
      mailingZipCode: p.mailingAddress?.zipCode || '',
      previouslyContracted: !!p.previouslyContracted,

      recruiterFullName: r.recruiterFullName || '',
      recruiterAgentId: r.recruiterAgentId || '',
      recruiterContact: r.recruiterContact || '',
      uplineLeaderName: r.uplineLeaderName || '',
      teamName: r.teamName || '',
      referralCode: r.referralCode || '',

      unsatisfiedJudgments: !!f.unsatisfiedJudgments,
      unsatisfiedJudgmentsExplanation: f.unsatisfiedJudgmentsExplanation || '',
      unsatisfiedLiens: !!f.unsatisfiedLiens,
      unsatisfiedLiensExplanation: f.unsatisfiedLiensExplanation || '',
      bankruptcyFiled: !!f.bankruptcy?.filed,
      bankruptcyChapter: f.bankruptcy?.chapter || '',
      bankruptcyStatus: f.bankruptcy?.status || '',

      currentlyLicensed: !!l.currentlyLicensed,
      statesLicensed: (l.statesLicensed || []).join(', '),
      licenseNumber: l.licenseNumber || '',
      licenseStatus: l.licenseStatus || '',
      licenseOtherDescription: l.licenseOtherDescription || ''
    };
    this.complianceQuestions.forEach(q => {
      patch[q.key] = !!c[q.key]?.answer;
      patch[q.key + 'Explanation'] = c[q.key]?.explanation || '';
    });
    this.form.patchValue(patch);
    this.original = this.form.getRawValue();
  }

  get f() { return this.form.controls; }

  isTrue(name: string): boolean {
    return this.form.get(name)?.value === true;
  }

  setBool(name: string, value: boolean): void {
    this.form.get(name)?.setValue(value);
  }

  toggleLicenseType(type: string, checked: boolean): void {
    this.selectedLicenseTypes = checked
      ? Array.from(new Set([...this.selectedLicenseTypes, type]))
      : this.selectedLicenseTypes.filter(t => t !== type);
  }

  private validateConditional(): string {
    const v = this.form.getRawValue();
    const o = this.original;
    // Only enforce details for answers the agent has newly switched on; answers
    // that were already "Yes" at submission keep whatever was recorded then.
    const isNew = (name: string) => v[name] === true && o[name] !== true;
    const needText = (name: string, expl: string) => !isNew(name) || (v[expl] || '').trim().length >= 10;

    for (const q of this.complianceQuestions) {
      if (!needText(q.key, q.key + 'Explanation')) {
        return 'Please explain each newly selected "Yes" answer in the compliance questions (at least 10 characters).';
      }
    }
    if (!needText('unsatisfiedJudgments', 'unsatisfiedJudgmentsExplanation') || !needText('unsatisfiedLiens', 'unsatisfiedLiensExplanation')) {
      return 'Please explain each newly selected "Yes" answer in the financial background section (at least 10 characters).';
    }
    if (isNew('bankruptcyFiled') && (!v.bankruptcyChapter || !v.bankruptcyStatus)) {
      return 'Please choose the bankruptcy chapter and status.';
    }
    if (isNew('hasDifferentMailing') && !(v.mailingStreet && v.mailingCity && v.mailingState && v.mailingZipCode)) {
      return 'Please complete the mailing address.';
    }
    if (isNew('currentlyLicensed') && (!this.selectedLicenseTypes.length || !v.statesLicensed || !v.licenseNumber || !v.licenseStatus)) {
      return 'Please complete all licensing details.';
    }
    return '';
  }

  save(): void {
    this.error = '';
    this.success = '';
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      const labels: Record<string, string> = {
        legalFirstName: 'First Name', legalLastName: 'Last Name', gender: 'Gender',
        dateOfBirth: 'Date of Birth', ssn: 'Social Security Number (e.g. 123-45-6789)',
        mobilePhone: 'Mobile Phone (min 10 digits)', homeStreet: 'Home Street', homeCity: 'Home City',
        homeState: 'Home State', homeZipCode: 'Home Zip (5 digits, e.g. 12345)'
      };
      const bad = Object.keys(this.form.controls).filter(k => this.form.get(k)?.invalid).map(k => labels[k] || k);
      this.error = `Please fix the following before saving: ${bad.join(', ')}.`;
      window.scrollTo(0, 0);
      return;
    }
    const conditionalError = this.validateConditional();
    if (conditionalError) {
      this.error = conditionalError;
      window.scrollTo(0, 0);
      return;
    }

    const confirmText = this.rejected
      ? 'Resubmit your application? You will be asked to sign the updated agreement again, and your previous version will be kept in your version history. Editing is locked until an admin reviews it.'
      : 'Save these changes? You will need to sign the updated agreement again, your previous version will be kept in your version history, and editing is locked afterwards.';
    if (!confirm(confirmText)) {
      return;
    }

    this.saving = true;
    this.apaEditService.saveApplication(this.buildPayload()).subscribe({
      next: (res: any) => {
        this.saving = false;
        this.saved = true;
        this.unlocked = false;
        this.awaitingSignature = !!res.resignRequired;
        if (res.resignRequired) {
          this.success = (res.signatureSent
            ? 'Your application was updated (version ' + res.version + '). Check your email from Zoho Sign and sign the updated agreement. It then goes back to an admin for review.'
            : 'Your application was updated (version ' + res.version + '), but the signature request could not be sent. Use "Resend signature request" below.');
        } else {
          this.success = (res.changed
            ? `Your application was updated (${res.changed} field${res.changed > 1 ? 's' : ''} changed).`
            : 'No changes were made.') + ' Editing is now locked.';
        }
        window.scrollTo(0, 0);
      },
      error: (err: any) => {
        this.saving = false;
        this.error = err.error?.message || 'Failed to save your application';
        if (err.status === 403) this.unlocked = false;
        window.scrollTo(0, 0);
      }
    });
  }

  private buildPayload(): any {
    const v = this.form.getRawValue();
    const compliance: Record<string, any> = {};
    this.complianceQuestions.forEach(q => {
      compliance[q.key] = { answer: v[q.key], explanation: v[q.key + 'Explanation'] };
    });

    return {
      personalInfo: {
        legalFirstName: v.legalFirstName,
        legalMiddleName: v.legalMiddleName,
        legalLastName: v.legalLastName,
        agencyLegalName: v.agencyLegalName,
        gender: v.gender,
        dateOfBirth: v.dateOfBirth,
        ssn: v.ssn,
        mobilePhone: v.mobilePhone,
        homeAddress: { street: v.homeStreet, city: v.homeCity, state: v.homeState, zipCode: v.homeZipCode },
        mailingAddress: v.hasDifferentMailing
          ? { street: v.mailingStreet, city: v.mailingCity, state: v.mailingState, zipCode: v.mailingZipCode }
          : null,
        previouslyContracted: v.previouslyContracted
      },
      complianceQuestions: compliance,
      financialBackground: {
        unsatisfiedJudgments: v.unsatisfiedJudgments,
        unsatisfiedJudgmentsExplanation: v.unsatisfiedJudgmentsExplanation,
        unsatisfiedLiens: v.unsatisfiedLiens,
        unsatisfiedLiensExplanation: v.unsatisfiedLiensExplanation,
        bankruptcy: { filed: v.bankruptcyFiled, chapter: v.bankruptcyChapter, status: v.bankruptcyStatus }
      },
      licensingStatus: {
        currentlyLicensed: v.currentlyLicensed,
        licenseTypes: this.selectedLicenseTypes,
        statesLicensed: (v.statesLicensed || '').split(',').map((s: string) => s.trim()).filter(Boolean),
        licenseNumber: v.licenseNumber,
        licenseStatus: v.licenseStatus,
        licenseOtherDescription: v.licenseOtherDescription
      }
    };
  }

  resendSignature(): void {
    this.resending = true;
    this.error = '';
    this.apaEditService.resign().subscribe({
      next: (res: any) => {
        this.resending = false;
        this.success = res.message || 'Signature request sent.';
      },
      error: (err: any) => {
        this.resending = false;
        this.error = err.error?.message || 'Could not send the signature request';
      }
    });
  }

  back(): void {
    this.router.navigate(['/onboarding']);
  }
}
