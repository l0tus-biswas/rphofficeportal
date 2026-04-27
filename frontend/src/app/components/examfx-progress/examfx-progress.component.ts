import { Component, OnInit } from '@angular/core';
import { ExamfxService, ExamFXProgress, ExamFXSummary, ExamFXConfigStatus } from '../../services/examfx.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-examfx-progress',
  templateUrl: './examfx-progress.component.html',
  styleUrls: ['./examfx-progress.component.css']
})
export class ExamfxProgressComponent implements OnInit {
  isAdmin = false;
  currentUserId = '';
  loading = true;
  error = '';
  successMessage = '';

  configStatus: ExamFXConfigStatus | null = null;
  summary: ExamFXSummary | null = null;
  allProgress: ExamFXProgress[] = [];
  selectedAgent: ExamFXProgress | null = null;

  // Filter
  filterStatus: string = 'all';

  // Link account form
  showLinkForm = false;
  linkFormAgentId = '';
  linkFormExamFxId = '';
  linkFormEmail = '';

  // Manual update form
  showManualForm = false;
  manualEnrollmentStatus = 'not_enrolled';
  manualOverallPercent = 0;
  manualAdminNotes = '';

  // Syncing
  syncing = false;
  syncingAll = false;

  constructor(
    private examfxService: ExamfxService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    this.isAdmin = user?.role === 'admin';
    this.currentUserId = user?._id || '';

    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.error = '';

    // Load progress records
    this.examfxService.getAllProgress().subscribe({
      next: (data) => {
        this.allProgress = data;
        // Auto-select for agents
        if (!this.isAdmin && data.length > 0) {
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

    // Admin: also load summary and config
    if (this.isAdmin) {
      this.examfxService.getSummary().subscribe({
        next: (summary) => this.summary = summary,
        error: () => {} // Non-critical
      });

      this.examfxService.getConfigStatus().subscribe({
        next: (config) => this.configStatus = config,
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
    this.showLinkForm = false;
    this.showManualForm = false;
    this.successMessage = '';
  }

  // ── Sync ──
  syncAgent(): void {
    if (!this.selectedAgent) return;
    this.syncing = true;
    this.error = '';
    this.successMessage = '';

    this.examfxService.syncAgent(this.selectedAgent.agent._id).subscribe({
      next: (res) => {
        this.selectedAgent = res.record;
        this.successMessage = 'Sync completed successfully';
        this.syncing = false;
        this.loadData();
      },
      error: (err) => {
        this.error = err.error?.message || 'Sync failed';
        this.syncing = false;
      }
    });
  }

  syncAllAgents(): void {
    this.syncingAll = true;
    this.error = '';
    this.successMessage = '';

    this.examfxService.syncAll().subscribe({
      next: (res) => {
        this.successMessage = res.message;
        this.syncingAll = false;
        this.loadData();
      },
      error: (err) => {
        this.error = err.error?.message || 'Bulk sync failed';
        this.syncingAll = false;
      }
    });
  }

  // ── Link Account ──
  openLinkForm(): void {
    if (!this.selectedAgent) return;
    this.showLinkForm = true;
    this.showManualForm = false;
    this.linkFormAgentId = this.selectedAgent.agent._id;
    this.linkFormExamFxId = this.selectedAgent.examfxUserId || '';
    this.linkFormEmail = this.selectedAgent.examfxEmail || this.selectedAgent.agent.email || '';
  }

  submitLink(): void {
    if (!this.linkFormExamFxId && !this.linkFormEmail) {
      this.error = 'Provide ExamFX User ID or email';
      return;
    }

    this.examfxService.linkAccount(this.linkFormAgentId, {
      examfxUserId: this.linkFormExamFxId || undefined,
      examfxEmail: this.linkFormEmail || undefined
    }).subscribe({
      next: (res) => {
        this.successMessage = 'ExamFX account linked successfully';
        this.showLinkForm = false;
        this.selectedAgent = res.record;
        this.loadData();
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to link account';
      }
    });
  }

  // ── Manual Update ──
  openManualForm(): void {
    if (!this.selectedAgent) return;
    this.showManualForm = true;
    this.showLinkForm = false;
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

  // ── Helpers ──
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

  getSyncStatusClass(status: string): string {
    switch (status) {
      case 'success': return 'text-success';
      case 'failed': return 'text-danger';
      case 'pending': return 'text-warning';
      default: return 'text-muted';
    }
  }

  formatMinutes(minutes: number): string {
    if (!minutes) return '0m';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }
}
