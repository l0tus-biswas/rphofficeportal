import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// ---------- Tracker response ----------
export interface PromotionLevelInfo {
  name: string;
  rank: number;
  commissionPercent: number;
}

export interface ProducerTrack {
  premium: number;
  targetPremium: number;
  progressPercent: number;
  windowDays: number;
  income: number;
  targetIncome: number;
  incomeProgress: number;
  incomeWindowDays: number;
}

export interface RankRequirementDetail {
  rank: string;
  requiredCount: number;
  currentCount: number;
  met: boolean;
}

export interface BuilderTrack {
  premium: number;
  targetPremium: number;
  premiumProgress: number;
  activeAgents: number;
  targetAgentCount: number;
  agentProgress: number;
  overallProgress: number;
  windowDays: number;
  requiredRanks: RankRequirementDetail[];
  rankRequirementMet: boolean;
  income: number;
  targetIncome: number;
  incomeProgress: number;
  incomeWindowDays: number;
}

export interface FastTrackInfo {
  eligible: boolean;
  skipToLevel?: PromotionLevelInfo;
  track?: string;
  producerSkipThreshold?: number;
  builderSkipThreshold?: number;
}

export interface PromotionTrackerData {
  hasData: boolean;
  message?: string;
  currentLevel: PromotionLevelInfo;
  nextLevel: PromotionLevelInfo | null;
  isMaxLevel: boolean;
  promotionReady: boolean;
  producerMet: boolean;
  builderMet: boolean;
  producer: ProducerTrack;
  builder: BuilderTrack;
  totalDownline: number;
  skipInfo: { canSkip: boolean; requirements?: string };
  fastTrack: FastTrackInfo;
}

// ---------- Admin level config ----------
export interface BuilderRequiredRank {
  rank: string;
  count: number;
}

export interface PromotionLevel {
  _id: string;
  name: string;
  rank: number;
  commissionPercent: number;
  producerPremiumThreshold: number;
  producerWindowDays: number;
  producerIncomeThreshold: number;
  producerIncomeWindowDays: number;
  builderPremiumThreshold: number;
  builderAgentCountThreshold: number;
  builderWindowDays: number;
  builderRequiredRanks: BuilderRequiredRank[];
  builderIncomeThreshold: number;
  builderIncomeWindowDays: number;
  canSkipTo: boolean;
  skipMultiplier: number;
  skipLegCapPercent: number;
  isActive: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class PromotionService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /** Agent — get promotion tracker data with optional rolling window override */
  getTrackerData(windowDays?: number): Observable<PromotionTrackerData> {
    let params = new HttpParams();
    if (windowDays) {
      params = params.set('window', windowDays.toString());
    }
    return this.http.get<PromotionTrackerData>(`${this.apiUrl}/promotion/tracker`, { params });
  }

  /** All authenticated users — get all public promotion levels (for tracker arrow strip) */
  getLevels(): Observable<{ levels: PromotionLevel[] }> {
    return this.http.get<{ levels: PromotionLevel[] }>(`${this.apiUrl}/promotion/levels`, {
      params: { _t: Date.now().toString() }
    });
  }

  /** Admin — get all promotion levels */
  getAdminLevels(): Observable<{ levels: PromotionLevel[] }> {
    return this.http.get<{ levels: PromotionLevel[] }>(`${this.apiUrl}/promotion/admin/levels`, {
      params: { _t: Date.now().toString() }
    });
  }

  /** Admin — update a promotion level */
  updateLevel(id: string, data: Partial<PromotionLevel>): Observable<{ level: PromotionLevel; message: string }> {
    return this.http.put<{ level: PromotionLevel; message: string }>(`${this.apiUrl}/promotion/admin/levels/${id}`, data);
  }

  /** Admin — create a new promotion level */
  createLevel(data: Partial<PromotionLevel>): Observable<{ level: PromotionLevel; message: string }> {
    return this.http.post<{ level: PromotionLevel; message: string }>(`${this.apiUrl}/promotion/admin/levels`, data);
  }

  /** Admin — delete a promotion level */
  deleteLevel(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/promotion/admin/levels/${id}`);
  }

  /** Admin — reorder promotion levels */
  reorderLevels(order: Array<{ id: string; rank: number }>): Observable<{ levels: PromotionLevel[]; message: string }> {
    return this.http.put<{ levels: PromotionLevel[]; message: string }>(`${this.apiUrl}/promotion/admin/levels/reorder`, { order });
  }

  /** Check if current user is eligible for advancement */
  checkAdvancement(): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/promotion/check-advancement`, {});
  }
}
