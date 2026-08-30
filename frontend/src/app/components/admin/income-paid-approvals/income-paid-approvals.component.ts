import { Component, OnInit } from '@angular/core';
import { ProductionService, IncomePaidEntry, ProductionSubmission } from '../../../services/production.service';

@Component({
  selector: 'app-income-paid-approvals',
  templateUrl: './income-paid-approvals.component.html',
  styleUrls: ['./income-paid-approvals.component.css']
})
export class IncomePaidApprovalsComponent implements OnInit {
  error = '';
  success = '';

  entries: IncomePaidEntry[] = [];
  loading = false;
  statusFilter = 'pending';
  fromDateFilter = '';
  toDateFilter = '';

  selectedEntry: IncomePaidEntry | null = null;

  constructor(private productionService: ProductionService) {}

  ngOnInit(): void {
    this.loadEntries();
  }

  loadEntries(): void {
    this.loading = true;
    this.productionService.getIncomePaidAdmin({
      status: this.statusFilter || undefined,
      fromDate: this.fromDateFilter || undefined,
      toDate: this.toDateFilter || undefined
    }).subscribe({
      next: (res) => { this.entries = res.entries; this.loading = false; },
      error: () => { this.loading = false; }
    });
  }

  onFilterChange(): void {
    this.loadEntries();
  }

  viewEntry(entry: IncomePaidEntry): void {
    this.selectedEntry = entry;
  }

  closeView(): void {
    this.selectedEntry = null;
  }

  approve(entry: IncomePaidEntry): void {
    this.productionService.approveIncomePaid(entry._id).subscribe({
      next: () => {
        this.success = 'Income Paid approved.';
        if (this.selectedEntry?._id === entry._id) this.closeView();
        this.loadEntries();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => { this.error = this.extractError(err, 'Failed to approve entry'); }
    });
  }

  reject(entry: IncomePaidEntry): void {
    const reason = prompt('Reason for rejecting this entry (optional):') || '';
    this.productionService.rejectIncomePaid(entry._id, reason).subscribe({
      next: () => {
        this.success = 'Income Paid rejected.';
        if (this.selectedEntry?._id === entry._id) this.closeView();
        this.loadEntries();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => { this.error = this.extractError(err, 'Failed to reject entry'); }
    });
  }

  getStatusBadgeClass(status: string): string {
    const classes: any = { pending: 'bg-warning text-dark', approved: 'bg-success', rejected: 'bg-danger' };
    return classes[status] || 'bg-secondary';
  }

  /** Read-only linked-submission info for display in the queue table. */
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

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }

  private extractError(error: any, fallback: string): string {
    const body = error?.error;
    if (body?.errors?.length) {
      return body.errors.map((e: any) => e.message || e).join('; ');
    }
    return body?.message || error?.message || fallback;
  }
}
