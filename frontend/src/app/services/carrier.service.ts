import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CarrierDocument {
  _id?: string;
  name: string;
  filePath: string;
  originalFileName?: string;
  fileSize?: number;
  uploadedBy?: any;
  uploadedAt?: Date;
}

export interface Carrier {
  _id?: string;
  name: string;
  category: string[];
  isActive: boolean;
  contractingLink?: string;
  contractingInstructions?: string;
  whatToExpect?: string;
  supplementalLevelGuide?: string;
  documents?: CarrierDocument[];
  contactInfo?: {
    phone?: string;
    email?: string;
    website?: string;
  };
  notes?: string;
  addedBy?: any;
  lastModifiedBy?: any;
  createdAt?: Date;
  updatedAt?: Date;
}

const DOCUMENT_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

const PREVIEWABLE_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'];

function getDocumentExtension(fileName: string): string {
  return (fileName.split('.').pop() || '').toLowerCase();
}

// Browsers can render PDFs and images inline; Word docs can't be previewed
// and should just be downloaded instead.
export function isDocumentPreviewable(fileName: string): boolean {
  return PREVIEWABLE_EXTENSIONS.includes(getDocumentExtension(fileName));
}

export function getDocumentMimeType(fileName: string): string {
  return DOCUMENT_MIME_TYPES[getDocumentExtension(fileName)] || 'application/octet-stream';
}

export function getDocumentIcon(fileName: string): string {
  const ext = getDocumentExtension(fileName);
  if (ext === 'pdf') return 'bi-file-earmark-pdf text-danger';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'bi-file-earmark-image text-primary';
  if (['doc', 'docx'].includes(ext)) return 'bi-file-earmark-word text-primary';
  return 'bi-file-earmark text-muted';
}

export interface AgentCarrierStatus {
  _id?: string;
  agent?: any;
  carrier: any;
  status: 'Requested' | 'Pending' | 'Appointed' | 'Unappointed';
  requestedAt?: Date;
  appointedAt?: Date;
  appointedBy?: any;
  unappointedAt?: Date;
  unappointedBy?: any;
  notes?: { text: string; addedBy: any; addedAt: Date }[];
}

@Injectable({
  providedIn: 'root'
})
export class CarrierService {
  private apiUrl = `${environment.apiUrl}/carriers`;

  constructor(private http: HttpClient) {}

  // Get all carriers (admin: includes inactive; agents: active only)
  getAllCarriers(activeOnly: boolean = true): Observable<Carrier[]> {
    let params = new HttpParams();
    if (activeOnly) params = params.set('activeOnly', 'true');
    return this.http.get<Carrier[]>(this.apiUrl, { params });
  }

  // Get carriers filtered by category
  getCarriersByCategory(category: string): Observable<Carrier[]> {
    let params = new HttpParams().set('category', category);
    return this.http.get<Carrier[]>(this.apiUrl, { params });
  }

  // Get specific carrier
  getCarrier(id: string): Observable<Carrier> {
    return this.http.get<Carrier>(`${this.apiUrl}/${id}`);
  }

  // Create carrier (admin only) — supports FormData for PDF upload
  createCarrier(data: FormData | Partial<Carrier>): Observable<Carrier> {
    return this.http.post<Carrier>(this.apiUrl, data);
  }

  // Update carrier (admin only) — supports FormData for PDF upload
  updateCarrier(id: string, data: FormData | Partial<Carrier>): Observable<Carrier> {
    return this.http.put<Carrier>(`${this.apiUrl}/${id}`, data);
  }

  // Delete carrier (soft delete - mark inactive) (admin only)
  deleteCarrier(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  // Upload a named document (PDF, Word, or image) for a carrier (admin only)
  uploadCarrierDocument(carrierId: string, name: string, file: File): Observable<Carrier> {
    const formData = new FormData();
    formData.append('name', name);
    formData.append('file', file);
    return this.http.post<Carrier>(`${this.apiUrl}/${carrierId}/documents`, formData);
  }

  // Delete a carrier document (admin only)
  deleteCarrierDocument(carrierId: string, docId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${carrierId}/documents/${docId}`);
  }

  // Download/view a carrier document (any authenticated user)
  downloadCarrierDocument(carrierId: string, docId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${carrierId}/documents/${docId}/download`, { responseType: 'blob' });
  }

  // Download/view the legacy supplemental level guide PDF (any authenticated user)
  downloadLevelGuide(carrierId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${carrierId}/level-guide/download`, { responseType: 'blob' });
  }

  // -----------------------------------------------------------------------
  // Carrier Status (TASK 012)
  // -----------------------------------------------------------------------

  // Agent: get all their carrier status records
  getMyCarrierStatuses(): Observable<AgentCarrierStatus[]> {
    return this.http.get<AgentCarrierStatus[]>(`${this.apiUrl}/my-statuses`);
  }

  // Agent: request a contract with a carrier
  requestContract(carrierId: string): Observable<{ message: string; status: AgentCarrierStatus }> {
    return this.http.post<{ message: string; status: AgentCarrierStatus }>(`${this.apiUrl}/${carrierId}/request`, {});
  }

  // Admin: list all agents (for the appointments agent selector)
  getAgentsForAppointments(): Observable<{ _id: string; name: string; email: string }[]> {
    return this.http.get<{ _id: string; name: string; email: string }[]>(`${this.apiUrl}/admin/agents`);
  }

  // Admin: get a single agent's carrier statuses
  getAgentStatuses(agentId: string): Observable<AgentCarrierStatus[]> {
    return this.http.get<AgentCarrierStatus[]>(`${this.apiUrl}/admin/agent/${agentId}/statuses`);
  }

  // Admin: manually set an agent's appointment status for a carrier
  setAgentCarrierStatus(agentId: string, carrierId: string, status: 'Appointed' | 'Unappointed' | 'Pending'): Observable<any> {
    return this.http.put(`${this.apiUrl}/admin/agent/${agentId}/carrier/${carrierId}/status`, { status });
  }

  // Admin: list all pending/all requests
  getAllCarrierRequests(statusFilter?: string): Observable<AgentCarrierStatus[]> {
    let params = new HttpParams();
    if (statusFilter) params = params.set('status', statusFilter);
    return this.http.get<AgentCarrierStatus[]>(`${this.apiUrl}/admin/all-requests`, { params });
  }

  // Admin: appoint agent for a carrier
  appointCarrier(statusId: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/admin/status/${statusId}/appoint`, {});
  }

  // Admin: unappoint agent from a carrier
  unappointCarrier(statusId: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/admin/status/${statusId}/unappoint`, {});
  }

  // Admin: add note to a carrier request
  addNote(statusId: string, text: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/admin/status/${statusId}/notes`, { text });
  }
}

