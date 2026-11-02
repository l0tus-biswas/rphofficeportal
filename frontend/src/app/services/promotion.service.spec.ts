import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { PromotionService } from './promotion.service';
import { environment } from '../../environments/environment';

describe('PromotionService', () => {
  let service: PromotionService;
  let http: HttpTestingController;
  const api = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(PromotionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getTrackerData sends window param when provided', () => {
    service.getTrackerData(90).subscribe();
    const req = http.expectOne(r => r.url === `${api}/promotion/tracker`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('window')).toBe('90');
    req.flush({});
  });

  it('getTrackerData omits window param when not provided', () => {
    service.getTrackerData().subscribe();
    const req = http.expectOne(r => r.url === `${api}/promotion/tracker`);
    expect(req.request.params.has('window')).toBeFalse();
    req.flush({});
  });

  it('getLevels GETs /promotion/levels', () => {
    service.getLevels().subscribe();
    const req = http.expectOne(r => r.url === `${api}/promotion/levels`);
    expect(req.request.method).toBe('GET');
    req.flush({ levels: [] });
  });

  it('getAdminLevels GETs /promotion/admin/levels', () => {
    service.getAdminLevels().subscribe();
    const req = http.expectOne(r => r.url === `${api}/promotion/admin/levels`);
    expect(req.request.method).toBe('GET');
    req.flush({ levels: [] });
  });

  it('createLevel POSTs the payload', () => {
    const body = { name: 'x', rank: 2 };
    service.createLevel(body).subscribe();
    const req = http.expectOne(`${api}/promotion/admin/levels`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('updateLevel PUTs to the level id', () => {
    const body = { name: 'y' };
    service.updateLevel('abc', body).subscribe();
    const req = http.expectOne(`${api}/promotion/admin/levels/abc`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('deleteLevel DELETEs the level id', () => {
    service.deleteLevel('abc').subscribe();
    const req = http.expectOne(`${api}/promotion/admin/levels/abc`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ message: 'ok' });
  });

  it('reorderLevels PUTs {order:[{id,rank}]}', () => {
    const order = [{ id: 'a', rank: 1 }, { id: 'b', rank: 2 }];
    service.reorderLevels(order).subscribe();
    const req = http.expectOne(`${api}/promotion/admin/levels/reorder`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ order });
    req.flush({ levels: [] });
  });

  it('checkAdvancement POSTs an empty body', () => {
    service.checkAdvancement().subscribe();
    const req = http.expectOne(`${api}/promotion/check-advancement`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({});
  });
});
