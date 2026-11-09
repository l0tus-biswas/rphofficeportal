import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ApaEditService } from './apa-edit.service';
import { environment } from '../../environments/environment';

describe('ApaEditService', () => {
  let svc: ApaEditService;
  let http: HttpTestingController;
  const user = `${environment.apiUrl}/user/apa-application`;
  const admin = `${environment.apiUrl}/admin/apa-applications`;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    svc = TestBed.inject(ApaEditService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('requestEdit POSTs the reason to /edit-request', () => {
    svc.requestEdit('wrong DOB').subscribe();
    const req = http.expectOne(`${user}/edit-request`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason: 'wrong DOB' });
    req.flush({});
  });

  it('getApplication GETs the agent application', () => {
    svc.getApplication().subscribe();
    const req = http.expectOne(user);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('saveApplication PUTs the payload', () => {
    const payload = { personalInfo: { legalFirstName: 'A' } };
    svc.saveApplication(payload).subscribe();
    const req = http.expectOne(user);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(payload);
    req.flush({});
  });

  it('listEditRequests GETs /edit-requests with the status param', () => {
    svc.listEditRequests('pending').subscribe();
    const req = http.expectOne(r => r.url === `${admin}/edit-requests`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('status')).toBe('pending');
    req.flush({ requests: [], counts: {} });
  });

  it('getAgentEditRequest GETs the per-agent route', () => {
    svc.getAgentEditRequest('u1').subscribe();
    const req = http.expectOne(`${admin}/by-agent/u1/edit-request`);
    expect(req.request.method).toBe('GET');
    req.flush({ request: null });
  });

  it('approve, deny and lock PUT the adminNote to the right endpoint', () => {
    svc.approve('a1', 'ok').subscribe();
    let req = http.expectOne(`${admin}/a1/edit-request/approve`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ adminNote: 'ok' });
    req.flush({});

    svc.deny('a1', 'no').subscribe();
    req = http.expectOne(`${admin}/a1/edit-request/deny`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ adminNote: 'no' });
    req.flush({});

    svc.lock('a1').subscribe();
    req = http.expectOne(`${admin}/a1/edit-request/lock`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ adminNote: '' });
    req.flush({});
  });
});
