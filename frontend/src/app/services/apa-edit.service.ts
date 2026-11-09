import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type EditRequestStatus = 'none' | 'pending' | 'approved' | 'denied' | 'locked';

export interface ApaEditRequest {
  status: EditRequestStatus;
  reason?: string;
  requestedAt?: string;
  reviewedAt?: string;
  adminNote?: string;
  lastEditedAt?: string;
}

export interface ApaEditChange { field: string; from: string; to: string; }

export type ApaVersionReason = 'original' | 'edit_request' | 'rejection_resubmit';

export interface ApaVersion {
  version: number;
  reason: ApaVersionReason;
  isCurrent: boolean;
  snapshot?: any;
  signedDocumentUrl: string | null;
  signedAt: string | null;
  rejectionReason?: string | null;
  supersededAt?: string;
  awaitingSignature?: boolean;
}

export interface ApaVersionHistory { currentVersion: number; versions: ApaVersion[]; }

export interface AdminApaEditRequestRow {
  applicationId: string;
  agent: { _id: string | null; name: string; email: string };
  editRequest: ApaEditRequest;
  editHistory: { editedAt: string; changes: ApaEditChange[] }[];
}

@Injectable({ providedIn: 'root' })
export class ApaEditService {
  private userUrl = `${environment.apiUrl}/user/apa-application`;
  private adminUrl = `${environment.apiUrl}/admin/apa-applications`;

  constructor(private http: HttpClient) {}

  // Agent
  requestEdit(reason: string): Observable<any> {
    return this.http.post(`${this.userUrl}/edit-request`, { reason });
  }

  getApplication(): Observable<any> {
    return this.http.get(this.userUrl);
  }

  saveApplication(data: any): Observable<any> {
    return this.http.put(this.userUrl, data);
  }

  resign(): Observable<any> {
    return this.http.post(`${this.userUrl}/resign`, {});
  }

  getVersions(): Observable<ApaVersionHistory> {
    return this.http.get<ApaVersionHistory>(`${this.userUrl}/versions`);
  }

  // Admin
  getAdminVersions(applicationId: string): Observable<ApaVersionHistory> {
    return this.http.get<ApaVersionHistory>(`${this.adminUrl}/${applicationId}/versions`);
  }

  listEditRequests(status: string): Observable<{ requests: AdminApaEditRequestRow[]; counts: Record<string, number> }> {
    return this.http.get<any>(`${this.adminUrl}/edit-requests`, { params: { status } });
  }

  getAgentEditRequest(userId: string): Observable<{ request: AdminApaEditRequestRow | null }> {
    return this.http.get<any>(`${this.adminUrl}/by-agent/${userId}/edit-request`);
  }

  approve(applicationId: string, adminNote = ''): Observable<any> {
    return this.http.put(`${this.adminUrl}/${applicationId}/edit-request/approve`, { adminNote });
  }

  deny(applicationId: string, adminNote = ''): Observable<any> {
    return this.http.put(`${this.adminUrl}/${applicationId}/edit-request/deny`, { adminNote });
  }

  lock(applicationId: string, adminNote = ''): Observable<any> {
    return this.http.put(`${this.adminUrl}/${applicationId}/edit-request/lock`, { adminNote });
  }
}
