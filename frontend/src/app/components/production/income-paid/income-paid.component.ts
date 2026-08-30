import { Component, OnInit } from '@angular/core';
import { ProductionService, IncomePaidEntry, ProductionSubmission, CustomFieldDef } from '../../../services/production.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-income-paid',
  templateUrl: './income-paid.component.html',
  styleUrls: ['./income-paid.component.css']
})
export class IncomePaidComponent implements OnInit {
  isAdmin = false;
  error = '';
  success = '';

  // The agent's own production submissions — picked from here so an Income
  // Paid entry is always tied to a specific client/policy, instead of a
  // blind free-text entry.
  mySubmissions: ProductionSubmission[] = [];
  submissionsLoading = false;
  submissionSearchTerm = '';
  customFieldDefs: CustomFieldDef[] = [];
  selectedSubmission: ProductionSubmission | null = null;

  myIncomePaid: IncomePaidEntry[] = [];
  incomePaidLoading = false;
  incomePaidSaving = false;
  newIncomeAmount: number | null = null;
  newIncomeDatePaid = '';
  newIncomeNotes = '';

  constructor(
    private productionService: ProductionService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    this.isAdmin = user?.role === 'admin';
    this.loadMySubmissions();
    this.loadCustomFields();
    this.loadMyIncomePaid();
  }

  loadMySubmissions(): void {
    this.submissionsLoading = true;
    // Non-admins only ever see their own submissions from this endpoint.
    this.productionService.getProductionSubmissions({ limit: 500 }).subscribe({
      next: (res) => { this.mySubmissions = res.submissions; this.submissionsLoading = false; },
      error: () => { this.submissionsLoading = false; }
    });
  }

  loadCustomFields(): void {
    this.productionService.getCustomFields().subscribe({
      next: (res) => { this.customFieldDefs = res.fields; },
      error: () => {}
    });
  }

  get filteredSubmissions(): ProductionSubmission[] {
    const term = this.submissionSearchTerm.trim().toLowerCase();
    if (!term) return this.mySubmissions;
    return this.mySubmissions.filter(s =>
      (s.clientName || '').toLowerCase().includes(term) ||
      (s.productSold || '').toLowerCase().includes(term) ||
      (s.carrier?.name || '').toLowerCase().includes(term)
    );
  }

  getCustomFieldValue(submission: ProductionSubmission, key: string): string {
    if (!submission.customFields) return '—';
    const val = submission.customFields[key];
    if (val == null || val === '') return '—';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    return String(val);
  }

  selectSubmission(sub: ProductionSubmission): void {
    this.selectedSubmission = sub;
    this.error = '';
  }

  clearSelectedSubmission(): void {
    this.selectedSubmission = null;
  }

  loadMyIncomePaid(): void {
    this.incomePaidLoading = true;
    this.productionService.getMyIncomePaid().subscribe({
      next: (res) => { this.myIncomePaid = res.entries; this.incomePaidLoading = false; },
      error: () => { this.incomePaidLoading = false; }
    });
  }

  submitIncomePaid(): void {
    if (!this.selectedSubmission) {
      this.error = 'Please select which policy/client this income was paid on.';
      return;
    }
    if (!this.newIncomeAmount || this.newIncomeAmount < 0 || !this.newIncomeDatePaid) {
      this.error = 'Please provide a valid amount and date paid by carrier.';
      return;
    }
    this.incomePaidSaving = true;
    this.productionService.submitIncomePaid({
      productionSubmissionId: this.selectedSubmission._id!,
      amount: this.newIncomeAmount,
      datePaidByCarrier: this.newIncomeDatePaid,
      notes: this.newIncomeNotes
    }).subscribe({
      next: () => {
        this.success = 'Income Paid submitted for admin approval.';
        this.selectedSubmission = null;
        this.newIncomeAmount = null;
        this.newIncomeDatePaid = '';
        this.newIncomeNotes = '';
        this.incomePaidSaving = false;
        this.loadMyIncomePaid();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => {
        this.error = this.extractError(err, 'Failed to submit Income Paid');
        this.incomePaidSaving = false;
      }
    });
  }

  deleteIncomePaidEntry(entry: IncomePaidEntry): void {
    if (!confirm('Delete this Income Paid entry?')) return;
    this.productionService.deleteIncomePaid(entry._id).subscribe({
      next: () => {
        this.success = 'Entry deleted';
        this.loadMyIncomePaid();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => { this.error = this.extractError(err, 'Failed to delete entry'); }
    });
  }

  getIncomeStatusBadgeClass(status: string): string {
    const classes: any = { pending: 'bg-warning text-dark', approved: 'bg-success', rejected: 'bg-danger' };
    return classes[status] || 'bg-secondary';
  }

  /** Read-only linked-submission info for display in the My Income Paid Submissions table */
  getEntrySubmission(entry: IncomePaidEntry): ProductionSubmission | null {
    const sub = entry.productionSubmission;
    return sub && typeof sub === 'object' ? sub as ProductionSubmission : null;
  }

  formatDatePaid(date: any): string {
    if (!date) return '';
    // Date Paid by Carrier is a calendar date, not a point in time — stored as
    // UTC midnight for the selected day, so it must be displayed using UTC
    // components. Converting to the viewer's local timezone would otherwise
    // roll the displayed date back by one day for timezones behind UTC.
    return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  formatDate(date: any): string {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-US', { timeZone: 'UTC' });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }

  /** Pull the real server error message (validation detail or message) so the
   *  user sees WHY a request failed instead of a generic error. */
  private extractError(error: any, fallback: string): string {
    const body = error?.error;
    if (body?.errors?.length) {
      return body.errors.map((e: any) => e.message || e).join('; ');
    }
    return body?.message || error?.message || fallback;
  }
}
