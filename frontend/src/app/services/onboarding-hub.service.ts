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
  deletedAt?: Date;
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
}
