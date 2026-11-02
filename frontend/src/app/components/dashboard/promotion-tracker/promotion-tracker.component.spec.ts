import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { Subject, of, throwError } from 'rxjs';
import { PromotionTrackerComponent } from './promotion-tracker.component';
import { PromotionService } from '../../../services/promotion.service';

const level = (name: string, rank: number) => ({
  _id: name, name, rank, commissionPercent: rank * 10,
  producerPremiumThreshold: 1000 * rank, builderPremiumThreshold: 5000 * rank, builderAgentCountThreshold: 2
});

function trackerData(overrides: any = {}): any {
  return {
    hasData: true,
    currentLevel: { name: 'agent', rank: 1, commissionPercent: 10 },
    nextLevel: { name: 'senior agent', rank: 2, commissionPercent: 20 },
    isMaxLevel: false,
    promotionReady: false, producerMet: false, builderMet: false,
    producer: { premium: 100, targetPremium: 2000, progressPercent: 5, windowDays: 30, income: 0, targetIncome: 0, incomeProgress: 0, incomeWindowDays: 180 },
    builder: { premium: 0, targetPremium: 10000, premiumProgress: 0, activeAgents: 0, targetAgentCount: 2, agentProgress: 0, overallProgress: 0, windowDays: 60, requiredRanks: [], rankRequirementMet: false, income: 0, targetIncome: 0, incomeProgress: 0, incomeWindowDays: 180 },
    totalDownline: 0,
    skipInfo: { canSkip: false },
    fastTrack: { eligible: false },
    ...overrides
  };
}

describe('PromotionTrackerComponent', () => {
  let fixture: ComponentFixture<PromotionTrackerComponent>;
  let svc: jasmine.SpyObj<PromotionService>;

  function setup(tracker: any, levels: any = of({ levels: [level('agent', 1), level('senior agent', 2), level('director', 3)] })) {
    svc.getTrackerData.and.returnValue(tracker);
    svc.getLevels.and.returnValue(levels);
    fixture = TestBed.createComponent(PromotionTrackerComponent);
    fixture.detectChanges();
  }
  const text = () => (fixture.nativeElement as HTMLElement).textContent || '';

  beforeEach(() => {
    svc = jasmine.createSpyObj('PromotionService', ['getTrackerData', 'getLevels']);
    TestBed.configureTestingModule({
      declarations: [PromotionTrackerComponent],
      imports: [FormsModule],
      providers: [{ provide: PromotionService, useValue: svc }]
    });
  });

  it('shows loading state until data arrives', () => {
    const t$ = new Subject<any>();
    setup(t$, of({ levels: [] }));
    expect(text()).toContain('Loading promotion tracker');
    t$.next(trackerData());
    t$.complete();
    fixture.detectChanges();
    expect(text()).not.toContain('Loading promotion tracker');
    expect(text()).toContain('Promotion Tracker');
  });

  it('shows empty state with backend message when hasData is false', () => {
    setup(of({ hasData: false, message: 'No levels configured by admin.' }));
    expect(text()).toContain('Promotion tracker is not configured yet.');
    expect(text()).toContain('No levels configured by admin.');
    expect(text()).not.toContain('Window:');
  });

  it('shows an error message when loading fails', () => {
    setup(throwError(() => ({ error: { message: 'boom' } })));
    expect(text()).toContain('boom');
  });

  it('renders promotion-ready banner when eligible', () => {
    setup(of(trackerData({ promotionReady: true, producerMet: true })));
    expect(text()).toContain('Promotion threshold met!');
    expect(text()).toContain('Producer track');
  });

  it('uses backend skip multiplier and leg cap in fast-track banner and note', () => {
    setup(of(trackerData({
      promotionReady: true, producerMet: true,
      skipInfo: { canSkip: true, skipMultiplier: 1.75, skipLegCapPercent: 40 },
      fastTrack: {
        eligible: true, track: 'producer',
        skipToLevel: { name: 'director', rank: 3, commissionPercent: 30 },
        skipMultiplier: 1.75, skipLegCapPercent: 40
      }
    })));
    const t = text();
    expect(t).toContain('Fast-Track eligible!');
    expect(t).toContain('Director (30%)');
    expect(t).toContain('1.75× threshold met');
    expect(t).toContain('no more than 40% of team premium');
    expect(t).not.toContain('1.4×');
    expect(t).not.toContain('50% of team');
  });

  it('falls back to 1.4x and 50% when skip fields are absent', () => {
    setup(of(trackerData({
      skipInfo: { canSkip: true },
      fastTrack: { eligible: true, track: 'builder', skipToLevel: { name: 'director', rank: 3, commissionPercent: 30 } }
    })));
    const t = text();
    expect(t).toContain('1.4× threshold met');
    expect(t).toContain('no more than 50% of team premium');
  });

  it('requests tracker with selected window on window change', () => {
    setup(of(trackerData()));
    fixture.componentInstance.selectedWindow = 90;
    fixture.componentInstance.onWindowChange();
    expect(svc.getTrackerData).toHaveBeenCalledWith(90);
  });
});
