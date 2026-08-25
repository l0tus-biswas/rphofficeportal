import { Component, OnInit } from '@angular/core';
import { ProductionService, IncomePaidEntry } from '../../../services/production.service';
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

  myIncomePaid: IncomePaidEntry[] = [];
  adminIncomePaid: IncomePaidEntry[] = [];
  incomePaidStatusFilter = 'pending';
  incomePaidFromDateFilter = '';
  incomePaidToDateFilter = '';
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
    this.loadMyIncomePaid();
    if (this.isAdmin) this.loadAdminIncomePaid();
  }

  loadMyIncomePaid(): void {
    this.incomePaidLoading = true;
    this.productionService.getMyIncomePaid().subscribe({
      next: (res) => { this.myIncomePaid = res.entries; this.incomePaidLoading = false; },
      error: () => { this.incomePaidLoading = false; }
    });
  }

  loadAdminIncomePaid(): void {
    this.productionService.getIncomePaidAdmin({
      status: this.incomePaidStatusFilter || undefined,
      fromDate: this.incomePaidFromDateFilter || undefined,
      toDate: this.incomePaidToDateFilter || undefined
    }).subscribe({
      next: (res) => { this.adminIncomePaid = res.entries; },
      error: () => {}
    });
  }

  onIncomePaidFilterChange(): void {
    this.loadAdminIncomePaid();
  }

  submitIncomePaid(): void {
    if (!this.newIncomeAmount || this.newIncomeAmount < 0 || !this.newIncomeDatePaid) {
      this.error = 'Please provide a valid amount and date paid by carrier.';
      return;
    }
    this.incomePaidSaving = true;
    this.productionService.submitIncomePaid({
      amount: this.newIncomeAmount,
      datePaidByCarrier: this.newIncomeDatePaid,
      notes: this.newIncomeNotes
    }).subscribe({
      next: () => {
        this.success = 'Income Paid submitted for admin approval.';
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
        if (this.isAdmin) this.loadAdminIncomePaid();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => { this.error = this.extractError(err, 'Failed to delete entry'); }
    });
  }

  approveIncomePaid(entry: IncomePaidEntry): void {
    this.productionService.approveIncomePaid(entry._id).subscribe({
      next: () => {
        this.success = 'Income Paid approved.';
        this.loadAdminIncomePaid();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => { this.error = this.extractError(err, 'Failed to approve entry'); }
    });
  }

  rejectIncomePaid(entry: IncomePaidEntry): void {
    const reason = prompt('Reason for rejecting this entry (optional):') || '';
    this.productionService.rejectIncomePaid(entry._id, reason).subscribe({
      next: () => {
        this.success = 'Income Paid rejected.';
        this.loadAdminIncomePaid();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => { this.error = this.extractError(err, 'Failed to reject entry'); }
    });
  }

  getIncomeStatusBadgeClass(status: string): string {
    const classes: any = { pending: 'bg-warning text-dark', approved: 'bg-success', rejected: 'bg-danger' };
    return classes[status] || 'bg-secondary';
  }

  formatDatePaid(date: any): string {
    if (!date) return '';
    // Date Paid by Carrier is a calendar date, not a point in time — stored as
    // UTC midnight for the selected day, so it must be displayed using UTC
    // components. Converting to the viewer's local timezone would otherwise
    // roll the displayed date back by one day for timezones behind UTC.
    return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
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
