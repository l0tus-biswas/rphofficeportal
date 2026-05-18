import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ExamfxService, ExamFXProgress, ExamFXSummary, ExamFXCsvUploadResult, ExamFXImportBatch } from '../../services/examfx.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-examfx-progress',
  templateUrl: './examfx-progress.component.html',
  styleUrls: ['./examfx-progress.component.css']
})
export class ExamfxProgressComponent implements OnInit {
  isAdmin = false;
  isAdminRoute = false; // true when on /admin/examfx, false on /examfx-progress
  currentUserId = '';
  loading = true;
  error = '';
  successMessage = '';

  summary: ExamFXSummary | null = null;
  allProgress: ExamFXProgress[] = [];
  selectedAgent: ExamFXProgress | null = null;

  // Filter
  filterStatus: string = 'all';

  // Manual update form
  showManualForm = false;
  manualEnrollmentStatus = 'not_enrolled';
  manualOverallPercent = 0;
  manualAdminNotes = '';

  // CSV Upload
  uploading = false;
  csvUploadResult: ExamFXCsvUploadResult | null = null;
  showUploadResults = false;

  // Import History (admin)
  importHistory: ExamFXImportBatch[] = [];
  activeTab: 'progress' | 'history' = 'progress';

  // Last synced
  lastSyncedDate: string | null = null;

  constructor(
    private examfxService: ExamfxService,
    private authService: AuthService,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    this.isAdmin = user?.role === 'admin';
    this.currentUserId = user?._id || '';

    // Detect if this is the admin management route
    this.isAdminRoute = this.route.snapshot.data['roles']?.includes('admin') || false;

    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.error = '';

    // Load progress records
    this.examfxService.getAllProgress().subscribe({
      next: (data) => {
        this.allProgress = data;
        // Compute last synced from progress records
        let latest: Date | null = null;
        for (const r of data) {
          const candidates = [r.lastSyncDate, r.lastCsvImportDate, r.updatedAt].filter(Boolean);
          for (const d of candidates) {
            const dt = new Date(d as any);
            if (!latest || dt > latest) latest = dt;
          }
        }
        this.lastSyncedDate = latest ? latest.toISOString() : null;
        // Auto-select for agent view (non-admin route) or when only one record
        if (!this.isAdminRoute && data.length > 0) {
          this.selectedAgent = data.find(r => r.agent._id === this.currentUserId) || data[0];
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading ExamFX progress:', err);
        this.error = 'Failed to load ExamFX progress data';
        this.loading = false;
      }
    });

    // Admin route: also load summary and import history
    if (this.isAdminRoute) {
      this.examfxService.getSummary().subscribe({
        next: (summary) => this.summary = summary,
        error: () => {} // Non-critical
      });
      this.examfxService.getImportHistory().subscribe({
        next: (history) => this.importHistory = history,
        error: () => {} // Non-critical
      });
    }
  }

  get filteredProgress(): ExamFXProgress[] {
    if (this.filterStatus === 'all') return this.allProgress;
    return this.allProgress.filter(r => r.enrollmentStatus === this.filterStatus);
  }

  selectAgent(record: ExamFXProgress): void {
    this.selectedAgent = record;
    this.showManualForm = false;
    this.successMessage = '';
  }

  // ── Manual Update ──
  openManualForm(): void {
    if (!this.selectedAgent) return;
    this.showManualForm = true;
    this.manualEnrollmentStatus = this.selectedAgent.enrollmentStatus;
    this.manualOverallPercent = this.selectedAgent.overallPercentComplete;
    this.manualAdminNotes = this.selectedAgent.adminNotes || '';
  }

  submitManualUpdate(): void {
    if (!this.selectedAgent) return;

    this.examfxService.updateAgentProgress(this.selectedAgent.agent._id, {
      enrollmentStatus: this.manualEnrollmentStatus as any,
      overallPercentComplete: this.manualOverallPercent,
      adminNotes: this.manualAdminNotes
    }).subscribe({
      next: (updated) => {
        this.selectedAgent = updated;
        this.successMessage = 'Progress updated manually';
        this.showManualForm = false;
        this.loadData();
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to update progress';
      }
    });
  }

  // ── CSV Upload ──
  onCsvFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    if (!file.name.toLowerCase().endsWith('.csv')) {
      this.error = 'Please select a CSV file';
      input.value = '';
      return;
    }

    this.uploading = true;
    this.error = '';
    this.successMessage = '';
    this.csvUploadResult = null;

    this.examfxService.uploadCsv(file).subscribe({
      next: (result) => {
        this.csvUploadResult = result;
        this.showUploadResults = true;
        this.successMessage = result.message;
        this.uploading = false;
        input.value = '';
        this.loadData();
      },
      error: (err) => {
        this.error = err.error?.message || 'CSV upload failed';
        this.uploading = false;
        input.value = '';
      }
    });
  }

  dismissUploadResults(): void {
    this.showUploadResults = false;
    this.csvUploadResult = null;
  }

  // ── Helpers ──
  getTimeAgo(dateStr: string): string {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
    if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;
    if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  formatDate(date: any): string {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  formatDateTime(date: any): string {
    if (!date) return '—';
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'completed': return 'bg-success';
      case 'active':
      case 'in_progress': return 'bg-primary';
      case 'enrolled': return 'bg-info';
      case 'expired':
      case 'failed': return 'bg-danger';
      default: return 'bg-secondary';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'not_enrolled': return 'Not Enrolled';
      case 'enrolled': return 'Enrolled';
      case 'active': return 'Active';
      case 'completed': return 'Completed';
      case 'expired': return 'Expired';
      case 'not_started': return 'Not Started';
      case 'in_progress': return 'In Progress';
      case 'failed': return 'Failed';
      default: return status;
    }
  }

  getProgressBarClass(percent: number): string {
    if (percent >= 80) return 'bg-success';
    if (percent >= 40) return 'bg-warning';
    return 'bg-danger';
  }

  formatMinutes(minutes: number): string {
    if (!minutes) return '0m';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }
}
