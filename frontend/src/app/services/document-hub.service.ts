import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface DocFolder {
  _id?: string;
  name: string;
  parent: string | null;
  description?: string;
  createdBy?: any;
  sortOrder?: number;
  isActive?: boolean;
  createdAt?: string;
}

export interface DocHubFile {
  _id?: string;
  name: string;
  folder: any;
  filePath: string;
  originalFileName: string;
  mimeType?: string;
  fileSize?: number;
  description?: string;
  uploadedBy?: any;
  visibility?: 'all' | 'admin';
  isActive?: boolean;
  createdAt?: string;
}

export interface DocRequest {
  _id?: string;
  requestedBy?: any;
  requestedFrom?: any[];
  title: string;
  description?: string;
  dueDate?: string;
  saveToFolder?: any;
  responses?: DocRequestResponse[];
  isActive?: boolean;
  createdAt?: string;
}

export interface DocRequestResponse {
  agent: any;
  status: 'pending' | 'submitted' | 'approved' | 'rejected';
  filePath?: string;
  originalFileName?: string;
  submittedAt?: string;
  reviewedBy?: any;
  reviewedAt?: string;
  reviewNotes?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DocumentHubService {
  private apiUrl = `${environment.apiUrl}/document-hub`;

  constructor(private http: HttpClient) {}

  // --- Folders ---
  getFolders(all = false): Observable<DocFolder[]> {
    let params = new HttpParams();
    if (all) params = params.set('all', 'true');
    return this.http.get<DocFolder[]>(`${this.apiUrl}/folders`, { params });
  }

  createFolder(data: Partial<DocFolder>): Observable<DocFolder> {
    return this.http.post<DocFolder>(`${this.apiUrl}/folders`, data);
  }

  updateFolder(id: string, data: Partial<DocFolder>): Observable<DocFolder> {
    return this.http.put<DocFolder>(`${this.apiUrl}/folders/${id}`, data);
  }

  deleteFolder(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/folders/${id}`);
  }

  // --- Files ---
  getFiles(folderId?: string | null, search?: string): Observable<DocHubFile[]> {
    let params = new HttpParams();
    if (folderId) {
      params = params.set('folder', folderId);
    } else if (folderId === null) {
      params = params.set('root', 'true');
    }
    if (search) params = params.set('search', search);
    return this.http.get<DocHubFile[]>(`${this.apiUrl}/files`, { params });
  }

  uploadFiles(formData: FormData): Observable<any> {
    return this.http.post(`${this.apiUrl}/files`, formData);
  }

  updateFile(id: string, data: Partial<DocHubFile>): Observable<DocHubFile> {
    return this.http.put<DocHubFile>(`${this.apiUrl}/files/${id}`, data);
  }

  deleteFile(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/files/${id}`);
  }

  downloadFile(id: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/files/${id}/download`, { responseType: 'blob' });
  }

  // --- Requests ---
  getRequests(): Observable<DocRequest[]> {
    return this.http.get<DocRequest[]>(`${this.apiUrl}/requests`);
  }

  createRequest(data: { title: string; description?: string; dueDate?: string; requestedFrom: string[]; saveToFolder?: string | null }): Observable<DocRequest> {
    return this.http.post<DocRequest>(`${this.apiUrl}/requests`, data);
  }

  respondToRequest(requestId: string, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post(`${this.apiUrl}/requests/${requestId}/respond`, formData);
  }

  reviewResponse(requestId: string, agentId: string, status: string, reviewNotes?: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/requests/${requestId}/review/${agentId}`, { status, reviewNotes });
  }

  deleteRequest(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/requests/${id}`);
  }

  downloadResponse(requestId: string, agentId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/requests/${requestId}/responses/${agentId}/download`, { responseType: 'blob' });
  }
}
