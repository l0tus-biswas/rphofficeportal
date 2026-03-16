import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AcaTrackerData {
  hasData: boolean;
  // Reported (self-reported from production submissions)
  reportedClientCount: number;
  reportedPremium: number;
  reportedProducingAgents: number;
  // Verified (carrier-verified from admin CSV)
  verifiedClientCount: number;
  verifiedPremium: number;
  verifiedProducingAgents: number;
  // Tier info (based on verified)
  currentTier: number;
  currentTierLabel: string;
  bonusRate: number;
  bonusAmount: number;
  progressPercent: number;
  tierThreshold: number;
  nextTierThreshold: number;
  // Batch info
  uploadBatch: string | null;
  uploadedAt: string | null;
}

export interface AcaBatch {
  _id: string;
  agentCount: number;
  totalClients: number;
  totalVerifiedPremium: number;
  producingAgents: number;
  uploadedAt: string;
}

export interface AcaUploadResult {
  message: string;
  uploadBatch: string;
  totalClientRows: number;
  agentGroupsFound: number;
  matched: number;
  unmatchedCount: number;
  unmatched: any[];
  errors: any[];
}

@Injectable({
  providedIn: 'root'
})
export class AcaService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /** Agent dashboard tracker data (own + downline) */
  getTrackerData(): Observable<AcaTrackerData> {
    return this.http.get<AcaTrackerData>(`${this.apiUrl}/dashboard/aca-tracker`);
  }

  /** Admin: upload CSV file */
  uploadCsv(formData: FormData): Observable<AcaUploadResult> {
    return this.http.post<AcaUploadResult>(`${this.apiUrl}/admin/aca-clients/upload`, formData);
  }

  /** Admin: list upload batches */
  getBatches(): Observable<{ batches: AcaBatch[] }> {
    return this.http.get<{ batches: AcaBatch[] }>(`${this.apiUrl}/admin/aca-clients/batches`);
  }

  /** Admin: list records for a specific batch */
  getBatchRecords(batch: string): Observable<{ records: any[] }> {
    const params = new HttpParams().set('batch', batch);
    return this.http.get<{ records: any[] }>(`${this.apiUrl}/admin/aca-clients/records`, { params });
  }

  /** Admin: download sample CSV template (blob, auth header included) */
  downloadSampleCsv(): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/admin/aca-clients/sample-csv`, { responseType: 'blob' });
  }
}
