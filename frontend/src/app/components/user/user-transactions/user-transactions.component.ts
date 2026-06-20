import { getAppTimezone } from '../../../services/timezone.service';
import { Component, OnInit } from '@angular/core';
import { PaymentService } from '../../../services/payment.service';

@Component({
  selector: 'app-user-transactions',
  templateUrl: './user-transactions.component.html',
  styleUrls: ['./user-transactions.component.css']
})
export class UserTransactionsComponent implements OnInit {
  payments: any[] = [];
  subscription: any = null;
  paymentStatus: any = null;
  
  loading = true;
  error = '';

  cancelProcessing = false;
  actionMessage = '';
  actionError = '';

  currentPage = 1;
  pageSize = 20;
  totalItems = 0;
  totalPages = 0;

  constructor(private paymentService: PaymentService) { }

  ngOnInit(): void {
    this.loadPaymentStatus();
    this.loadPayments();
    this.loadSubscription();
  }

  loadPaymentStatus(): void {
    this.paymentService.getPaymentStatus().subscribe({
      next: (response) => {
        this.paymentStatus = response;
      },
      error: (error) => {
        console.error('Error loading payment status:', error);
      }
    });
  }

  loadPayments(): void {
    this.loading = true;
    this.paymentService.getUserPayments(this.currentPage, this.pageSize).subscribe({
      next: (response) => {
        this.payments = response.payments || [];
        this.totalItems = response.pagination.total;
        this.totalPages = response.pagination.pages;
        this.loading = false;
      },
      error: (error) => {
        this.error = error.error?.message || 'Failed to load payments';
        this.loading = false;
      }
    });
  }

  loadSubscription(): void {
    this.paymentService.getUserSubscription().subscribe({
      next: (response) => {
        this.subscription = response.subscription;
      },
      error: (error) => {
        console.log('No subscription found');
      }
    });
  }

  get canCancel(): boolean {
    return !!this.subscription
      && ['active', 'trialing', 'past_due'].includes(this.subscription.status)
      && !this.subscription.cancelAtPeriodEnd;
  }

  get cancellationScheduled(): boolean {
    return !!this.subscription
      && this.subscription.cancelAtPeriodEnd
      && this.subscription.status !== 'canceled';
  }

  cancelSubscription(): void {
    const endDate = this.subscription?.currentPeriodEnd
      ? this.formatDate(this.subscription.currentPeriodEnd)
      : 'the end of your current billing period';
    const confirmed = confirm(
      `Are you sure you want to cancel your subscription?\n\n` +
      `You'll keep access until ${endDate}, and you won't be billed for the next cycle.`
    );
    if (!confirmed) return;

    this.cancelProcessing = true;
    this.actionMessage = '';
    this.actionError = '';
    this.paymentService.cancelMySubscription().subscribe({
      next: (response) => {
        this.actionMessage = response?.message || 'Your subscription has been canceled.';
        this.cancelProcessing = false;
        this.loadSubscription();
        this.loadPaymentStatus();
      },
      error: (error) => {
        this.actionError = error.error?.message || 'Failed to cancel subscription. Please try again or contact support.';
        this.cancelProcessing = false;
      }
    });
  }

  reactivateSubscription(): void {
    this.cancelProcessing = true;
    this.actionMessage = '';
    this.actionError = '';
    this.paymentService.reactivateMySubscription().subscribe({
      next: (response) => {
        this.actionMessage = response?.message || 'Your subscription has been reactivated.';
        this.cancelProcessing = false;
        this.loadSubscription();
        this.loadPaymentStatus();
      },
      error: (error) => {
        this.actionError = error.error?.message || 'Failed to reactivate subscription. Please try again or contact support.';
        this.cancelProcessing = false;
      }
    });
  }

  getStatusBadgeClass(status: string): string {
    const statusMap: any = {
      'succeeded': 'badge bg-success',
      'pending': 'badge bg-warning',
      'failed': 'badge bg-danger',
      'refunded': 'badge bg-secondary',
      'canceled': 'badge bg-secondary'
    };
    return statusMap[status] || 'badge bg-secondary';
  }

  getSubscriptionStatusBadge(status: string): string {
    const statusMap: any = {
      'active': 'badge bg-success',
      'past_due': 'badge bg-warning',
      'canceled': 'badge bg-danger',
      'incomplete': 'badge bg-warning',
      'trialing': 'badge bg-info',
      'unpaid': 'badge bg-danger'
    };
    return statusMap[status] || 'badge bg-secondary';
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', { timeZone: getAppTimezone(), 
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatAmount(cents: number): string {
    return '$' + (cents / 100).toFixed(2);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.loadPayments();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadPayments();
    }
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadPayments();
    }
  }
}
