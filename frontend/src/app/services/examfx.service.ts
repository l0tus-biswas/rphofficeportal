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

export interface ExamFXQuizStats {
  chapterQuizCount: number | null;
  chapterQuizzesPassed: number | null;
  quizPassRate: number | null;
  overallQuizAverage: number | null;
}

export interface ExamFXExamScoreSet {
  best: number | null;
  average: number | null;
  latest: number | null;
  attempts: number | null;
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
  // CSV import fields
  scoreTrend?: number | null;
  activeAlerts?: number | null;
  courseExpirationDate?: Date | null;
  licensingExamDate?: Date | null;
  quizStats?: ExamFXQuizStats;
  practiceExamScores?: {
    examMode: ExamFXExamScoreSet;
    learningMode: ExamFXExamScoreSet;
  };
  readinessExamScores?: ExamFXExamScoreSet;
  certificateExam?: {
    status: string | null;
    best: number | null;
    average: number | null;
    latest: number | null;
    attempts: number | null;
  };
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
  lastCsvImportDate?: Date;
  csvImportedBy?: any;
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

export interface ExamFXCsvUploadResult {
  message: string;
  totalRows: number;
  matched: number;
  created: number;
  updated: number;
  unmatched: { rowIndex: number; candidate: string; email: string; course: string; reason: string }[];
  matchedDetails: { agentId: string; agentName: string; agentEmail: string; course: string; progress: number; enrollmentStatus: string; certificateStatus: string | null }[];
  errors: { rowIndex: number; candidate: string; reason: string }[];
  completedAgents: { agentId: string; agentName: string; course: string }[];
}

export interface ExamFXImportBatch {
  importDate: string;
  importedBy: { _id: string; name: string; email: string } | null;
  agents: { agentId: string; agentName: string; agentEmail: string; enrollmentStatus: string; overallPercentComplete: number; courseCount: number }[];
}

@Injectable({
  providedIn: 'root'
})
export class ExamfxService {
  private apiUrl = `${environment.apiUrl}/examfx`;

  constructor(private http: HttpClient) {}

  // Get all progress records (admin: all, agent: own + downline)
  getAllProgress(): Observable<ExamFXProgress[]> {
    return this.http.get<ExamFXProgress[]>(this.apiUrl);
  }

  // Get dashboard summary
  getSummary(): Observable<ExamFXSummary> {
    return this.http.get<ExamFXSummary>(`${this.apiUrl}/summary`);
  }

  // Get CSV import history (admin only)
  getImportHistory(): Observable<ExamFXImportBatch[]> {
    return this.http.get<ExamFXImportBatch[]>(`${this.apiUrl}/import-history`);
  }

  // Get specific agent's progress
  getAgentProgress(agentId: string): Observable<ExamFXProgress> {
    return this.http.get<ExamFXProgress>(`${this.apiUrl}/${agentId}`);
  }

  // Admin: manually update agent's progress
  updateAgentProgress(agentId: string, data: Partial<ExamFXProgress>): Observable<ExamFXProgress> {
    return this.http.put<ExamFXProgress>(`${this.apiUrl}/${agentId}`, data);
  }

  // Admin: delete an agent's ExamFX record
  deleteRecord(agentId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${agentId}`);
  }

  // Admin: upload ExamFX CSV export to sync progress
  uploadCsv(file: File): Observable<ExamFXCsvUploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<ExamFXCsvUploadResult>(`${this.apiUrl}/upload-csv`, formData);
  }
}
