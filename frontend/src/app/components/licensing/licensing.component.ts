import { getAppTimezone } from '../../services/timezone.service';
import { Component, OnInit } from '@angular/core';
import { LicensingService, LicensingProgress } from '../../services/licensing.service';
import { AuthService } from '../../services/auth.service';
import { Router, ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-licensing',
  templateUrl: './licensing.component.html',
  styleUrls: ['./licensing.component.css']
})
export class LicensingComponent implements OnInit {
  licensingProgress: LicensingProgress[] = [];
  selectedAgent: LicensingProgress | null = null;
  loading = true;
  error = '';
  isAdmin = false;
  currentUserId = '';

  // Filters
  filterIsLicensed: string = 'all'; // 'all', 'licensed', 'unlicensed'

  // Checklist item being edited
  editingItem: string | null = null;
  uploadingFile: { [key: string]: boolean } = {};
  uploadFileNotes: { [key: string]: string } = {};

  // Reschedule form state (per checklist item)
  rescheduleForm: { [key: string]: { date: string; outcome: string; notes: string } } = {};
  showReschedule: { [key: string]: boolean } = {};
  savingReschedule: { [key: string]: boolean } = {};

  // Attempt/reschedule history edit state (keyed by "<item>:<historyEntryId>")
  editHistoryForm: { [key: string]: { date: string; outcome: string; notes: string } } = {};
  savingHistoryEdit: { [key: string]: boolean } = {};

  constructor(
    private licensingService: LicensingService,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    // Only show admin view when on /admin/licensing route
    const isAdminRoute = this.router.url.startsWith('/admin/');
    this.isAdmin = user?.role === 'admin' && isAdminRoute;
    this.currentUserId = user?._id || '';
    
    this.loadLicensingProgress();
  }

  loadLicensingProgress(): void {
    this.loading = true;
    this.error = '';

    // Personal view: fetch only own licensing record
    if (!this.isAdmin) {
      this.licensingService.getLicensingProgress(this.currentUserId).subscribe({
        next: (data) => {
          this.selectedAgent = data;
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading licensing progress:', error);
          this.error = 'No licensing progress found. Please contact your administrator.';
          this.loading = false;
        }
      });
      return;
    }

    // Admin view: fetch all agents
    const filters: any = {};
    if (this.filterIsLicensed === 'licensed') {
      filters.isLicensed = true;
    } else if (this.filterIsLicensed === 'unlicensed') {
      filters.isLicensed = false;
    }

    this.licensingService.getAllLicensingProgress(filters).subscribe({
      next: (data) => {
        this.licensingProgress = data;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading licensing progress:', error);
        this.error = 'Failed to load licensing progress';
        this.loading = false;
      }
    });
  }

  selectAgent(progress: LicensingProgress): void {
    this.selectedAgent = progress;
    this.editingItem = null;
  }

  getDaysRemainingColor(days: number): string {
    if (days <= 10) return 'text-danger';
    if (days <= 20) return 'text-warning';
    return 'text-success';
  }

  updateChecklistItem(item: string, field: string, value: any): void {
    if (!this.selectedAgent || !this.isAdmin) return;

    const data: any = {};
    data[field] = value;

    this.licensingService.updateChecklistItem(
      this.selectedAgent.agent._id,
      item,
      data
    ).subscribe({
      next: (updated) => {
        this.selectedAgent = updated;
        // Update in list
        const index = this.licensingProgress.findIndex(
          p => p.agent._id === updated.agent._id
        );
        if (index !== -1) {
          this.licensingProgress[index] = updated;
        }
      },
      error: (error) => {
        console.error('Error updating checklist:', error);
        alert('Failed to update checklist item');
      }
    });
  }

  onFileSelected(event: any, item: string): void {
    const file = event.target.files?.[0];
    if (!file || !this.selectedAgent) return;

    this.uploadingFile[item] = true;

    this.licensingService.uploadDocument(
      this.selectedAgent.agent._id,
      item,
      file,
      this.uploadFileNotes[item] || ''
    ).subscribe({
      next: (response) => {
        this.selectedAgent = response.licensingProgress;
        // Update in list
        const index = this.licensingProgress.findIndex(
          p => p.agent._id === response.licensingProgress.agent._id
        );
        if (index !== -1) {
          this.licensingProgress[index] = response.licensingProgress;
        }
        this.uploadingFile[item] = false;
        this.uploadFileNotes[item] = '';
        alert('Document uploaded successfully');
      },
      error: (error) => {
        console.error('Error uploading document:', error);
        alert('Failed to upload document');
        this.uploadingFile[item] = false;
      }
    });
  }

  updateAdminNotes(): void {
    if (!this.selectedAgent || !this.isAdmin) return;

    const notes = prompt('Enter admin notes:', this.selectedAgent.adminNotes || '');
    if (notes === null) return;

    this.licensingService.updateAdminNotes(
      this.selectedAgent.agent._id,
      notes
    ).subscribe({
      next: (updated) => {
        this.selectedAgent = updated;
        // Update in list
        const index = this.licensingProgress.findIndex(
          p => p.agent._id === updated.agent._id
        );
        if (index !== -1) {
          this.licensingProgress[index] = updated;
        }
      },
      error: (error) => {
        console.error('Error updating notes:', error);
        alert('Failed to update notes');
      }
    });
  }

  // Every date on this page (admin and agent views alike) renders through this
  // one method so the format can never drift between the two — e.g. "12th July, 2026".
  formatDate(date: any): string {
    if (!date) return 'Not set';
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'Not set';

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: getAppTimezone(),
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).formatToParts(d);

    const day = parts.find(p => p.type === 'day')?.value || '';
    const month = parts.find(p => p.type === 'month')?.value || '';
    const year = parts.find(p => p.type === 'year')?.value || '';

    return `${day}${this.ordinalSuffix(Number(day))} ${month}, ${year}`;
  }

  private ordinalSuffix(day: number): string {
    if (day >= 11 && day <= 13) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  }

  // Convert a stored date into the YYYY-MM-DD value an <input type="date"> needs
  toDateInput(date: any): string {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tz).toISOString().substring(0, 10);
  }

  // Save a date field for a checklist item (e.g. scheduledDate, appointmentDate)
  updateChecklistDate(item: string, field: string, value: string): void {
    if (!this.isAdmin) return;
    // Empty string clears the date
    this.updateChecklistItem(item, field, value || null);
  }

  toggleReschedule(item: string): void {
    this.showReschedule[item] = !this.showReschedule[item];
    if (this.showReschedule[item] && !this.rescheduleForm[item]) {
      this.rescheduleForm[item] = { date: '', outcome: 'Scheduled', notes: '' };
    }
  }

  addReschedule(item: string): void {
    if (!this.selectedAgent || !this.isAdmin) return;
    const form = this.rescheduleForm[item];
    if (!form || !form.date) {
      alert('Please choose a date for this attempt.');
      return;
    }

    this.savingReschedule[item] = true;
    this.licensingService.addReschedule(this.selectedAgent.agent._id, item, {
      date: form.date,
      outcome: form.outcome,
      notes: form.notes
    }).subscribe({
      next: (updated) => {
        this.selectedAgent = updated;
        const index = this.licensingProgress.findIndex(p => p.agent._id === updated.agent._id);
        if (index !== -1) this.licensingProgress[index] = updated;
        this.savingReschedule[item] = false;
        this.showReschedule[item] = false;
        this.rescheduleForm[item] = { date: '', outcome: 'Scheduled', notes: '' };
      },
      error: (error) => {
        console.error('Error adding reschedule:', error);
        alert('Failed to record attempt');
        this.savingReschedule[item] = false;
      }
    });
  }

  historyKey(item: string, historyId: string | undefined): string {
    return `${item}:${historyId}`;
  }

  isEditingHistory(item: string, historyId: string | undefined): boolean {
    return !!this.editHistoryForm[this.historyKey(item, historyId)];
  }

  startEditHistory(item: string, entry: any): void {
    if (!this.isAdmin) return;
    this.editHistoryForm[this.historyKey(item, entry._id)] = {
      date: this.toDateInput(entry.date),
      outcome: entry.outcome,
      notes: entry.notes || ''
    };
  }

  cancelEditHistory(item: string, entry: any): void {
    delete this.editHistoryForm[this.historyKey(item, entry._id)];
  }

  saveEditHistory(item: string, entry: any): void {
    if (!this.selectedAgent || !this.isAdmin) return;
    const key = this.historyKey(item, entry._id);
    const form = this.editHistoryForm[key];
    if (!form || !form.date) {
      alert('Please choose a date for this attempt.');
      return;
    }

    this.savingHistoryEdit[key] = true;
    this.licensingService.updateScheduleHistory(this.selectedAgent.agent._id, item, entry._id, {
      date: form.date,
      outcome: form.outcome,
      notes: form.notes
    }).subscribe({
      next: (updated) => {
        this.selectedAgent = updated;
        const index = this.licensingProgress.findIndex(p => p.agent._id === updated.agent._id);
        if (index !== -1) this.licensingProgress[index] = updated;
        this.savingHistoryEdit[key] = false;
        delete this.editHistoryForm[key];
      },
      error: (error) => {
        console.error('Error updating attempt:', error);
        alert('Failed to update attempt');
        this.savingHistoryEdit[key] = false;
      }
    });
  }

  deleteHistoryEntry(item: string, entry: any): void {
    if (!this.selectedAgent || !this.isAdmin) return;
    if (!confirm('Delete this attempt/reschedule entry? This cannot be undone.')) return;

    this.licensingService.deleteScheduleHistory(this.selectedAgent.agent._id, item, entry._id).subscribe({
      next: (updated) => {
        this.selectedAgent = updated;
        const index = this.licensingProgress.findIndex(p => p.agent._id === updated.agent._id);
        if (index !== -1) this.licensingProgress[index] = updated;
        delete this.editHistoryForm[this.historyKey(item, entry._id)];
      },
      error: (error) => {
        console.error('Error deleting attempt:', error);
        alert('Failed to delete attempt');
      }
    });
  }

  // Whether this specific checklist step has actually been recorded. This must
  // reflect the real per-item data so the badge never disagrees with the
  // checkbox / dates the admin edits.
  isItemComplete(item: any): boolean {
    return !!(item && (item.completed || item.scheduled || item.submitted || item.approved));
  }

  // An already-licensed agent who never ran RHP's internal pipeline (e.g. they
  // joined with an existing/self-reported license) has steps that are simply
  // not required — show those blank steps as N/A rather than a contradictory
  // "Completed" or an alarming "Pending".
  isItemNotApplicable(item: any): boolean {
    return !!this.selectedAgent?.isLicensed && !this.isItemComplete(item);
  }

  getChecklistItemStatus(item: any): string {
    if (this.isItemComplete(item)) return 'Completed';
    if (this.isItemNotApplicable(item)) return 'N/A';
    return 'Pending';
  }

  getChecklistItemClass(item: any): string {
    // Only genuinely completed steps get the green row — N/A and Pending stay neutral.
    return this.isItemComplete(item) ? 'list-group-item-success' : '';
  }

  // True when the agent is licensed but did not complete the internal pipeline
  // (no obtained date) — i.e. licensed via a self-reported / pre-existing license.
  isSelfReportedLicense(): boolean {
    return !!this.selectedAgent?.isLicensed && !this.selectedAgent?.licenseObtainedDate;
  }
}
