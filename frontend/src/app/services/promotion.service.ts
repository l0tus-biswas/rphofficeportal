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
export interface PromotionLevel {
  _id: string;
  name: string;
  rank: number;
  commissionPercent: number;
  producerPremiumThreshold: number;
  producerWindowDays: number;
  builderPremiumThreshold: number;
  builderAgentCountThreshold: number;
  builderWindowDays: number;
  canSkipTo: boolean;
  skipRequirements: string;
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
    return this.http.get<{ levels: PromotionLevel[] }>(`${this.apiUrl}/promotion/levels`);
  }

  /** Admin — get all promotion levels */
  getAdminLevels(): Observable<{ levels: PromotionLevel[] }> {
    return this.http.get<{ levels: PromotionLevel[] }>(`${this.apiUrl}/promotion/admin/levels`);
  }

  /** Admin — update a promotion level */
  updateLevel(id: string, data: Partial<PromotionLevel>): Observable<{ level: PromotionLevel; message: string }> {
    return this.http.put<{ level: PromotionLevel; message: string }>(`${this.apiUrl}/promotion/admin/levels/${id}`, data);
  }

  /** Check if current user is eligible for advancement */
  checkAdvancement(): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/promotion/check-advancement`, {});
  }
}
