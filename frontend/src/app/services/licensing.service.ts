import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface LicensingProgress {
  _id?: string;
  agent: any;
  enrollmentDate: Date;
  licensingDeadline: Date;
  licenseObtainedDate?: Date;
  isLicensed: boolean;
  daysRemaining?: number;
  completionPercentage?: number;
  checklist: {
    preLicenseCourse: ChecklistItem;
    stateExam: StateExamItem;
    fingerprinting: ChecklistItem;
    diceApplication: ChecklistItem;
    stateAppointment: ChecklistItem;
  };
  adminNotes?: string;
  lastUpdatedBy?: any;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ChecklistItem {
  completed?: boolean;
  scheduled?: boolean;
  submitted?: boolean;
  approved?: boolean;
  completedDate?: Date;
  appointmentDate?: Date;
  submittedDate?: Date;
  approvedDate?: Date;
  documents: Document[];
  notes?: string;
}

export interface StateExamItem extends ChecklistItem {
  attempts: number;
  scheduledDate?: Date;
}

export interface Document {
  filename: string;
  url: string;
  uploadedAt: Date;
  uploadedBy?: any;
}

@Injectable({
  providedIn: 'root'
})
export class LicensingService {
  private apiUrl = `${environment.apiUrl}/licensing`;

  constructor(private http: HttpClient) {}

  // Get all licensing progress (admin) or own (agent)
  getAllLicensingProgress(filters?: any): Observable<LicensingProgress[]> {
    let params = new HttpParams();
    if (filters?.agentId) params = params.set('agentId', filters.agentId);
    if (filters?.isLicensed !== undefined) params = params.set('isLicensed', filters.isLicensed);
    
    return this.http.get<LicensingProgress[]>(this.apiUrl, { params });
  }

  // Get specific agent's licensing progress
  getLicensingProgress(agentId: string): Observable<LicensingProgress> {
    return this.http.get<LicensingProgress>(`${this.apiUrl}/${agentId}`);
  }

  // Create licensing progress for agent (admin only)
  createLicensingProgress(agentId: string, data?: any): Observable<LicensingProgress> {
    return this.http.post<LicensingProgress>(`${this.apiUrl}/${agentId}`, data || {});
  }

  // Update checklist item
  updateChecklistItem(agentId: string, checklistItem: string, data: any): Observable<LicensingProgress> {
    return this.http.put<LicensingProgress>(`${this.apiUrl}/${agentId}/checklist`, {
      checklistItem,
      data
    });
  }

  // Upload document for checklist item
  uploadDocument(agentId: string, checklistItem: string, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('document', file);
    
    return this.http.post(`${this.apiUrl}/${agentId}/upload/${checklistItem}`, formData);
  }

  // Update admin notes
  updateAdminNotes(agentId: string, notes: string): Observable<LicensingProgress> {
    return this.http.put<LicensingProgress>(`${this.apiUrl}/${agentId}/notes`, {
      adminNotes: notes
    });
  }

  // Get countdown status for all unlicensed agents (admin only)
  getCountdownStatus(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/countdown/all`);
  }
}
