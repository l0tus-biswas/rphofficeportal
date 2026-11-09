import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApaApplicationEditComponent } from './apa-application-edit.component';
import { ApaEditService } from '../../../services/apa-edit.service';

const QUESTIONS = ['previouslyContractedOther', 'felonyConviction', 'misdemeanorFraud', 'civilAction', 'licenseDenied', 'bondIssues'];

const makeApp = (over: any = {}): any => {
  const compliance: any = {};
  QUESTIONS.forEach(k => (compliance[k] = { answer: false, explanation: '' }));
  return {
    editRequest: { status: 'approved' },
    personalInfo: {
      legalFirstName: 'Lotus', legalMiddleName: '', legalLastName: 'Biswas', agencyLegalName: 'N/A',
      gender: 'M', dateOfBirth: '1990-05-17T00:00:00.000Z', ssn: '123-45-1234', mobilePhone: '5551234567',
      email: 'lotus@example.com',
      homeAddress: { street: '1 Main St', city: 'Austin', state: 'TX', zipCode: '78701' },
      mailingAddress: null, previouslyContracted: false
    },
    recruitingInfo: {
      recruiterFullName: 'Rec Ruiter', recruiterAgentId: 'AGT1', recruiterContact: 'rec@example.com',
      uplineLeaderName: 'Up', teamName: 'Team', referralCode: 'AGT1'
    },
    complianceQuestions: compliance,
    financialBackground: { unsatisfiedJudgments: false, unsatisfiedLiens: false, bankruptcy: { filed: false } },
    licensingStatus: { currentlyLicensed: false, licenseTypes: [], statesLicensed: [] },
    ...over
  };
};

describe('ApaApplicationEditComponent', () => {
  let fixture: ComponentFixture<ApaApplicationEditComponent>;
  let comp: ApaApplicationEditComponent;
  let svc: jasmine.SpyObj<ApaEditService>;
  let router: jasmine.SpyObj<Router>;

  const create = (app: any) => {
    svc.getApplication.and.returnValue(of({ application: app }));
    fixture = TestBed.createComponent(ApaApplicationEditComponent);
    comp = fixture.componentInstance;
    fixture.detectChanges();
  };

  beforeEach(() => {
    svc = jasmine.createSpyObj('ApaEditService', ['getApplication', 'saveApplication']);
    router = jasmine.createSpyObj('Router', ['navigate']);
    spyOn(window, 'scrollTo');
    TestBed.configureTestingModule({
      declarations: [ApaApplicationEditComponent],
      imports: [ReactiveFormsModule],
      providers: [
        { provide: ApaEditService, useValue: svc },
        { provide: Router, useValue: router }
      ]
    });
  });

  describe('when edit access is approved', () => {
    beforeEach(() => create(makeApp()));

    it('builds the form and unlocks', () => {
      expect(comp.form).toBeTruthy();
      expect(comp.unlocked).toBeTrue();
      expect(comp.loading).toBeFalse();
    });

    it('disables email and every recruiting field', () => {
      ['email', 'recruiterFullName', 'recruiterAgentId', 'recruiterContact', 'uplineLeaderName', 'teamName', 'referralCode']
        .forEach(k => expect(comp.form.get(k)!.disabled).withContext(k).toBeTrue());
      const inputs = fixture.nativeElement.querySelectorAll('input[formcontrolname="referralCode"]');
      expect((inputs[0] as HTMLInputElement).disabled).toBeTrue();
    });

    it('populates the form: DOB trimmed, N/A agency blank, SSN blank but masked', () => {
      const v = comp.form.getRawValue();
      expect(v.dateOfBirth).toBe('1990-05-17');
      expect(v.agencyLegalName).toBe('');
      expect(v.ssn).toBe('');
      expect(comp.maskedSsn).toBe('***-**-1234');
      expect(v.legalFirstName).toBe('Lotus');
      expect(v.homeZipCode).toBe('78701');
      expect(v.referralCode).toBe('AGT1');
    });

    it('blocks save on an invalid zip and names the field', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      comp.form.patchValue({ homeZipCode: '741101' });
      comp.save();
      expect(svc.saveApplication).not.toHaveBeenCalled();
      expect(comp.error).toContain('Home Zip');
    });

    it('does not require an explanation for an answer that was already Yes', () => {
      // original snapshot is taken at populate(); re-create with a pre-existing Yes and no explanation
      const app = makeApp();
      app.complianceQuestions.felonyConviction = { answer: true, explanation: '' };
      create(app);
      spyOn(window, 'confirm').and.returnValue(true);
      svc.saveApplication.and.returnValue(of({ changed: 0 }));
      comp.save();
      expect(comp.error).toBe('');
      expect(svc.saveApplication).toHaveBeenCalledTimes(1);
    });

    it('requires an explanation when a compliance answer is newly switched to Yes', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      comp.setBool('felonyConviction', true);
      comp.form.patchValue({ felonyConvictionExplanation: 'too short' });
      comp.save();
      expect(svc.saveApplication).not.toHaveBeenCalled();
      expect(comp.error).toContain('newly selected "Yes"');

      comp.form.patchValue({ felonyConvictionExplanation: 'a long enough explanation' });
      svc.saveApplication.and.returnValue(of({ changed: 1 }));
      comp.save();
      expect(svc.saveApplication).toHaveBeenCalledTimes(1);
    });

    it('requires financial explanations only for newly switched Yes answers', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      comp.setBool('unsatisfiedLiens', true);
      comp.save();
      expect(comp.error).toContain('financial background');
      expect(svc.saveApplication).not.toHaveBeenCalled();
    });

    it('requires bankruptcy chapter/status only when bankruptcy is newly filed', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      comp.setBool('bankruptcyFiled', true);
      comp.save();
      expect(comp.error).toContain('bankruptcy chapter and status');
      comp.form.patchValue({ bankruptcyChapter: '7', bankruptcyStatus: 'Discharged' });
      svc.saveApplication.and.returnValue(of({ changed: 1 }));
      comp.save();
      expect(svc.saveApplication).toHaveBeenCalledTimes(1);
    });

    it('requires the mailing address only when the different-mailing box is newly ticked', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      comp.setBool('hasDifferentMailing', true);
      comp.save();
      expect(comp.error).toContain('mailing address');
      expect(svc.saveApplication).not.toHaveBeenCalled();
    });

    it('requires licensing details only when currently-licensed is newly Yes', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      comp.setBool('currentlyLicensed', true);
      comp.save();
      expect(comp.error).toContain('licensing details');
      expect(svc.saveApplication).not.toHaveBeenCalled();
    });

    it('does nothing when the confirm dialog is declined', () => {
      spyOn(window, 'confirm').and.returnValue(false);
      comp.save();
      expect(svc.saveApplication).not.toHaveBeenCalled();
      expect(comp.saving).toBeFalse();
      expect(comp.saved).toBeFalse();
    });

    it('saves once when confirmed, omits recruitingInfo, then locks the page', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      svc.saveApplication.and.returnValue(of({ changed: 2 }));
      comp.save();
      expect(svc.saveApplication).toHaveBeenCalledTimes(1);
      const payload = svc.saveApplication.calls.mostRecent().args[0];
      expect('recruitingInfo' in payload).toBeFalse();
      expect(payload.personalInfo.legalFirstName).toBe('Lotus');
      expect(comp.saved).toBeTrue();
      expect(comp.unlocked).toBeFalse();
      expect(comp.success).toContain('2 fields changed');
      expect(comp.success.toLowerCase()).toContain('locked');
    });

    it('sets unlocked=false when the server answers 403', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      svc.saveApplication.and.returnValue(throwError(() => ({ status: 403, error: { message: 'Editing is locked.' } })));
      comp.save();
      expect(comp.unlocked).toBeFalse();
      expect(comp.error).toBe('Editing is locked.');
      expect(comp.saved).toBeFalse();
    });
  });

  describe('when an admin rejected the application', () => {
    beforeEach(() => create(makeApp({ status: 'rejected', rejectionReason: 'DOB is wrong', editRequest: { status: 'none' } })));

    it('unlocks without an edit request and shows the rejection reason', () => {
      expect(comp.unlocked).toBeTrue();
      expect(comp.rejected).toBeTrue();
      const banner = fixture.nativeElement.querySelector('[data-testid="rejection-banner"]');
      expect(banner.textContent).toContain('DOB is wrong');
    });

    it('keeps recruiting fields and email disabled', () => {
      expect(comp.form.get('email')?.disabled).toBeTrue();
      expect(comp.form.get('recruiterFullName')?.disabled).toBeTrue();
    });

    it('asks to resubmit and then waits for the new signature', () => {
      const confirmSpy = spyOn(window, 'confirm').and.returnValue(true);
      svc.saveApplication.and.returnValue(of({ changed: 1, resignRequired: true, signatureSent: true, version: 2 }));
      comp.save();
      expect(confirmSpy.calls.mostRecent().args[0]).toContain('Resubmit');
      expect(comp.awaitingSignature).toBeTrue();
      expect(comp.unlocked).toBeFalse();
      expect(comp.success).toContain('version 2');
      expect(comp.success).toContain('sign');
    });

    it('offers to resend the signature request when it could not be sent', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      svc.saveApplication.and.returnValue(of({ changed: 1, resignRequired: true, signatureSent: false, version: 2 }));
      comp.save();
      expect(comp.success).toContain('Resend signature request');
      svc.resign = jasmine.createSpy('resign').and.returnValue(of({ message: 'Signature request sent.' }));
      comp.resendSignature();
      expect(svc.resign).toHaveBeenCalled();
      expect(comp.success).toBe('Signature request sent.');
    });
  });

  describe('when the updated application awaits the new signature', () => {
    it('stays locked and shows the waiting notice', () => {
      create(makeApp({ status: 'pending_resignature', editRequest: { status: 'locked' } }));
      expect(comp.unlocked).toBeFalse();
      expect(comp.awaitingSignature).toBeTrue();
      expect(fixture.nativeElement.querySelector('[data-testid="awaiting-signature"]')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('[data-testid="edit-locked"]')).toBeNull();
    });
  });

  describe('when edit access is not approved', () => {
    it('stays locked and does not populate the form', () => {
      create(makeApp({ editRequest: { status: 'locked' } }));
      expect(comp.unlocked).toBeFalse();
      expect(comp.form.getRawValue().legalFirstName).toBe('');
      expect(fixture.nativeElement.querySelector('[data-testid="edit-locked"]')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('form')).toBeNull();
    });
  });
});
