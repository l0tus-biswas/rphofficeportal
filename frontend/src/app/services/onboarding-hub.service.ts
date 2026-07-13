import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface OnboardingDocType {
  _id?: string;
  name: string;
  description?: string;
  required: boolean;
  agentCanUpload: boolean;
  agentCanDelete: boolean;
  isReadOnlyLink: boolean;
  hasDirectDepositFields: boolean;
  sortOrder: number;
  isActive: boolean;
}

export interface OnboardingDocument {
  _id?: string;
  agent?: any;
  docType: OnboardingDocType | string;
  filePath?: string;
  originalFileName?: string;
  externalLink?: string;
  uploadedBy?: any;
  uploadedAt?: Date;
  status?: 'pending' | 'approved' | 'rejected' | 'missing';
  adminComment?: string;
  reviewedBy?: any;
  reviewedAt?: Date;
  deletedAt?: Date;
  hasBankingData?: boolean;
  history?: Array<{
    status: string;
    comment?: string;
    updatedBy?: any;
    updatedAt?: Date;
  }>;
}

export interface AdminOnboardingOverviewRow {
  agent: { _id: string; name: string; email: string; role: string };
  status: 'not-started' | 'pending' | 'approved' | 'rejected' | 'missing';
  totalRequired: number;
  uploadedRequired: number;
  approvedRequired: number;
  documentsCount: number;
  lastUploadedAt?: string | Date | null;
}

export interface AdminOnboardingAgentDetail {
  agent: { _id: string; name: string; email: string; role: string };
  cards: Array<{ docType: OnboardingDocType; document: OnboardingDocument | null }>;
  status: 'not-started' | 'pending' | 'approved' | 'rejected' | 'missing';
}

@Injectable({
  providedIn: 'root'
})
export class OnboardingHubService {
  private apiUrl = `${environment.apiUrl}/onboarding-hub`;

  constructor(private http: HttpClient) {}

  getDocTypes(): Observable<OnboardingDocType[]> {
    return this.http.get<OnboardingDocType[]>(`${this.apiUrl}/doc-types`);
  }

  // Admin: get all doc types including inactive
  getAllDocTypes(): Observable<OnboardingDocType[]> {
    return this.http.get<OnboardingDocType[]>(`${this.apiUrl}/doc-types`, { params: { all: 'true' } });
  }

  getDocuments(agentId: string): Observable<OnboardingDocument[]> {
    return this.http.get<OnboardingDocument[]>(`${this.apiUrl}/documents/${agentId}`);
  }

  uploadDocument(formData: FormData): Observable<any> {
    return this.http.post(`${this.apiUrl}/documents`, formData);
  }

  deleteDocument(documentId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/documents/${documentId}`);
  }

  getDownloadUrl(agentId: string, docId: string): string {
    return `${this.apiUrl}/documents/${agentId}/${docId}/download`;
  }

  // The download route requires an Authorization header (checked by the
  // `authenticate` middleware), so it must be fetched through HttpClient
  // (whose interceptor attaches the header) rather than a plain <a href>.
  downloadDocumentBlob(agentId: string, docId: string): Observable<Blob> {
    return this.http.get(this.getDownloadUrl(agentId, docId), { responseType: 'blob' });
  }

  // Admin doc type management
  createDocType(data: Partial<OnboardingDocType>): Observable<OnboardingDocType> {
    return this.http.post<OnboardingDocType>(`${this.apiUrl}/admin/doc-types`, data);
  }

  updateDocType(id: string, data: Partial<OnboardingDocType>): Observable<OnboardingDocType> {
    return this.http.put<OnboardingDocType>(`${this.apiUrl}/admin/doc-types/${id}`, data);
  }

  deleteDocType(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/admin/doc-types/${id}`);
  }

  // Admin onboarding management (hub-based)
  getAdminOverview(page = 1, limit = 20, status?: string, search?: string): Observable<any> {
    const params: any = { page, limit };
    if (status) params.status = status;
    if (search) params.search = search;
    return this.http.get<any>(`${this.apiUrl}/admin/overview`, { params });
  }

  getAdminAgentDetail(agentId: string): Observable<AdminOnboardingAgentDetail> {
    return this.http.get<AdminOnboardingAgentDetail>(`${this.apiUrl}/admin/agents/${agentId}`);
  }

  updateAdminDocumentStatus(documentId: string, status: 'pending' | 'approved' | 'rejected' | 'missing', comment?: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/admin/documents/${documentId}/status`, { status, comment });
  }

  getBankInfo(documentId: string): Observable<{ routingNumber: string; accountNumber: string; accountType: string }> {
    return this.http.get<{ routingNumber: string; accountNumber: string; accountType: string }>(
      `${this.apiUrl}/admin/documents/${documentId}/bank-info`
    );
  }
}
