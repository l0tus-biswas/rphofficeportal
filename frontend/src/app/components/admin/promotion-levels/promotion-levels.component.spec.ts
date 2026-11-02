import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { PromotionLevelsComponent } from './promotion-levels.component';
import { PromotionService } from '../../../services/promotion.service';

const mk = (name: string, rank: number): any => ({
  _id: 'id-' + name, name, rank, commissionPercent: rank * 10,
  producerPremiumThreshold: 0, producerWindowDays: 30, producerIncomeThreshold: 0, producerIncomeWindowDays: 180,
  builderPremiumThreshold: 0, builderAgentCountThreshold: 0, builderWindowDays: 60, builderRequiredRanks: [],
  builderIncomeThreshold: 0, builderIncomeWindowDays: 180,
  canSkipTo: false, skipMultiplier: 1.4, skipLegCapPercent: 50, isActive: true
});

describe('PromotionLevelsComponent', () => {
  let fixture: ComponentFixture<PromotionLevelsComponent>;
  let comp: PromotionLevelsComponent;
  let svc: jasmine.SpyObj<PromotionService>;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    svc = jasmine.createSpyObj('PromotionService',
      ['getAdminLevels', 'updateLevel', 'createLevel', 'deleteLevel', 'reorderLevels']);
    svc.getAdminLevels.and.returnValue(of({ levels: [mk('agent', 1), mk('director', 2)] }));
    TestBed.configureTestingModule({
      declarations: [PromotionLevelsComponent],
      imports: [FormsModule],
      providers: [{ provide: PromotionService, useValue: svc }]
    });
    fixture = TestBed.createComponent(PromotionLevelsComponent);
    comp = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders the list of levels', () => {
    const titles = Array.from(el().querySelectorAll('h5.fw-bold')).map(e => e.textContent!.trim());
    expect(titles).toEqual(['Agent', 'Director']);
  });

  it('keeps the list visible and shows an error when delete fails', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    svc.deleteLevel.and.returnValue(throwError(() => ({ error: { message: 'Level in use' } })));
    comp.deleteLevel(comp.levels[0]);
    fixture.detectChanges();
    expect(el().querySelector('.alert-danger')!.textContent).toContain('Level in use');
    expect(el().querySelectorAll('h5.fw-bold').length).toBe(2);
    expect(svc.getAdminLevels).toHaveBeenCalledTimes(1);
  });

  it('disables the rank field in edit mode with a reorder hint', async () => {
    comp.openEditModal(comp.levels[0]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const rank = el().querySelector('#modalRank') as HTMLInputElement;
    expect(rank.disabled).toBeTrue();
    expect(el().textContent).toContain('up/down arrows');
  });

  it('keeps the rank field enabled when creating', async () => {
    comp.openAddModal();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((el().querySelector('#modalRank') as HTMLInputElement).disabled).toBeFalse();
  });

  it('does not send rank in the update payload', () => {
    svc.updateLevel.and.returnValue(of({} as any));
    comp.openEditModal(comp.levels[1]);
    comp.editingLevel.commissionPercent = 55;
    comp.submitModal();
    const [id, payload] = svc.updateLevel.calls.mostRecent().args;
    expect(id).toBe('id-director');
    expect('rank' in payload).toBeFalse();
    expect(payload.commissionPercent).toBe(55);
  });
});
