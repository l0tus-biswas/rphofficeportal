import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ExamFXCourseModule {
  moduleId: string;
  moduleName: string;
  status: 'not_started' | 'in_progress' | 'completed';
  percentComplete: number;
  completedDate?: Date;
}

export interface ExamFXCourse {
  courseId: string;
  courseName: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'failed';
  percentComplete: number;
  startedDate?: Date;
  completedDate?: Date;
  lastAccessedDate?: Date;
  score?: number;
  passingScore?: number;
  passed: boolean;
  timeSpentMinutes: number;
  modules: ExamFXCourseModule[];
}

export interface ExamFXPracticeExam {
  examName: string;
  dateTaken: Date;
  score: number;
  passingScore: number;
  passed: boolean;
  timeSpentMinutes: number;
}

export interface ExamFXProgress {
  _id?: string;
  agent: any;
  examfxUserId?: string;
  examfxEmail?: string;
  enrollmentStatus: 'not_enrolled' | 'enrolled' | 'active' | 'completed' | 'expired';
  enrollmentDate?: Date;
  overallPercentComplete: number;
  courses: ExamFXCourse[];
  practiceExams: ExamFXPracticeExam[];
  lastSyncDate?: Date;
  lastSyncStatus: 'success' | 'failed' | 'pending' | 'never';
  lastSyncError?: string;
  manualOverride: boolean;
  adminNotes?: string;
  lastUpdatedBy?: any;
  isComplete?: boolean;
  stats?: {
    total: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    failed: number;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ExamFXSummary {
  totalAgents: number;
  notEnrolled: number;
  enrolled: number;
  completed: number;
  expired: number;
  averageProgress: number;
  agents: {
    agentId: string;
    agentName: string;
    agentEmail: string;
    enrollmentStatus: string;
    overallPercentComplete: number;
    courseCount: number;
    coursesCompleted: number;
    lastSyncDate?: Date;
  }[];
}

export interface ExamFXConfigStatus {
  configured: boolean;
  hasWebhookSecret: boolean;
  apiUrl: string;
  orgId: string;
}

@Injectable({
  providedIn: 'root'
})
export class ExamfxService {
  private apiUrl = `${environment.apiUrl}/examfx`;

  constructor(private http: HttpClient) {}

  // Get config status (admin only)
  getConfigStatus(): Observable<ExamFXConfigStatus> {
    return this.http.get<ExamFXConfigStatus>(`${this.apiUrl}/config-status`);
  }

  // Get all progress records (admin: all, agent: own + downline)
  getAllProgress(): Observable<ExamFXProgress[]> {
    return this.http.get<ExamFXProgress[]>(this.apiUrl);
  }

  // Get dashboard summary
  getSummary(): Observable<ExamFXSummary> {
    return this.http.get<ExamFXSummary>(`${this.apiUrl}/summary`);
  }

  // Get specific agent's progress
  getAgentProgress(agentId: string): Observable<ExamFXProgress> {
    return this.http.get<ExamFXProgress>(`${this.apiUrl}/${agentId}`);
  }

  // Admin: manually update agent's progress
  updateAgentProgress(agentId: string, data: Partial<ExamFXProgress>): Observable<ExamFXProgress> {
    return this.http.put<ExamFXProgress>(`${this.apiUrl}/${agentId}`, data);
  }

  // Admin: link agent to ExamFX account
  linkAccount(agentId: string, data: { examfxUserId?: string; examfxEmail?: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/${agentId}/link`, data);
  }

  // Admin: trigger sync for one agent
  syncAgent(agentId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${agentId}/sync`, {});
  }

  // Admin: trigger bulk sync for all linked agents
  syncAll(): Observable<any> {
    return this.http.post(`${this.apiUrl}/sync/all`, {});
  }

  // Admin: delete an agent's ExamFX record
  deleteRecord(agentId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${agentId}`);
  }
}
