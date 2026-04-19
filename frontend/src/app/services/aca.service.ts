import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface TierEntry {
  tier: number;
  label: string;
  threshold: number;
  rate: number;
}

export interface AgentBreakdownEntry {
  agentId: string;
  agentName: string;
  agentEmail: string;
  clientCount: number;
  isProducing: boolean;
  isSelf: boolean;
}

export interface AcaTrackerData {
  hasData: boolean;
  // Personal
  personalReportedClients: number;
  personalReportedPremium: number;
  personalVerifiedClients: number;
  personalVerifiedPremium: number;
  // Team (downline only)
  teamReportedClients: number;
  teamReportedPremium: number;
  teamVerifiedClients: number;
  teamVerifiedPremium: number;
  teamVerifiedProducingAgents: number;
  teamReportedProducingAgents: number;
  // Combined totals
  totalReportedClients: number;
  totalReportedPremium: number;
  totalVerifiedClients: number;
  totalVerifiedPremium: number;
  // Tier info
  currentTier: number;
  currentTierLabel: string;
  bonusRate: number;
  bonusAmount: number;
  progressPercent: number;
  tierThreshold: number;
  nextTierThreshold: number;
  isMaxTier: boolean;
  allTiers: TierEntry[];
  // Batch info
  uploadBatch: string | null;
  uploadedAt: string | null;
  // Team breakdown
  agentBreakdown: AgentBreakdownEntry[];
  teamSize: number;
}

export interface AcaBatch {
  _id: string;
  agentCount: number;
  totalClients: number;
  totalVerifiedPremium: number;
  producingAgents: number;
  uploadedAt: string;
  uploadedByName?: string;
  source?: string;
}

export interface AcaFileResult {
  file: string;
  rowCount: number;
}

export interface AcaUploadResult {
  message: string;
  uploadBatch: string;
  totalClientRows: number;
  filesProcessed: number;
  fileResults: AcaFileResult[];
  agentGroupsFound: number;
  matched: number;
  matchedDetails: any[];
  unmatchedCount: number;
  unmatched: any[];
  invalidRows: any[];
  errors: any[];
  parseErrors: any[];
  replacedBatch: boolean;
}

export interface AcaTierOverride {
  _id: string;
  agent: { _id: string; name: string; email: string };
  tiers: TierEntry[];
  updatedAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class AcaService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // ── Agent tracker ──
  getTrackerData(): Observable<AcaTrackerData> {
    return this.http.get<AcaTrackerData>(`${this.apiUrl}/dashboard/aca-tracker`);
  }

  // ── Admin: upload (supports multi-file CSV/XLSX) ──
  uploadFiles(formData: FormData): Observable<AcaUploadResult> {
    return this.http.post<AcaUploadResult>(`${this.apiUrl}/admin/aca-clients/upload`, formData);
  }

  /** @deprecated Use uploadFiles instead */
  uploadCsv(formData: FormData): Observable<AcaUploadResult> {
    return this.uploadFiles(formData);
  }

  // ── Admin: batch management ──
  getBatches(): Observable<{ batches: AcaBatch[] }> {
    return this.http.get<{ batches: AcaBatch[] }>(`${this.apiUrl}/admin/aca-clients/batches`);
  }

  getBatchRecords(batch: string): Observable<{ records: any[] }> {
    const params = new HttpParams().set('batch', batch);
    return this.http.get<{ records: any[] }>(`${this.apiUrl}/admin/aca-clients/records`, { params });
  }

  deleteBatch(batch: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/admin/aca-clients/batches/${encodeURIComponent(batch)}`);
  }

  downloadSampleCsv(): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/admin/aca-clients/sample-csv`, { responseType: 'blob' });
  }

  // ── Admin: tier configuration (5.12) ──
  getTierConfig(): Observable<{ tiers: TierEntry[]; updatedAt: string | null }> {
    return this.http.get<any>(`${this.apiUrl}/admin/aca-tiers`);
  }

  updateTierConfig(tiers: TierEntry[]): Observable<any> {
    return this.http.put(`${this.apiUrl}/admin/aca-tiers`, { tiers });
  }

  // ── Admin: per-agent tier overrides (5.13) ──
  getAgentTierOverrides(): Observable<{ overrides: AcaTierOverride[] }> {
    return this.http.get<any>(`${this.apiUrl}/admin/aca-tiers/agent-overrides`);
  }

  setAgentTierOverride(agentId: string, tiers: TierEntry[]): Observable<any> {
    return this.http.put(`${this.apiUrl}/admin/aca-tiers/agent/${agentId}`, { tiers });
  }

  removeAgentTierOverride(agentId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/admin/aca-tiers/agent/${agentId}`);
  }
}
