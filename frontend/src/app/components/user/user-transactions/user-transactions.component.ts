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

  // Per-payment receipt loading state (keyed by payment id)
  receiptLoading: { [id: string]: boolean } = {};
  billingPortalLoading = false;

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

  // Open the Stripe Billing Portal to update card / manage subscription. The
  // portal is a full-page redirect (it returns the user to /transactions via
  // return_url), so we navigate the current tab — no popup, no blank window.
  openBillingPortal(): void {
    this.billingPortalLoading = true;
    this.actionError = '';
    this.actionMessage = '';
    this.paymentService.createBillingPortalSession().subscribe({
      next: (res) => {
        if (res?.url) {
          window.location.href = res.url;
        } else {
          this.billingPortalLoading = false;
          this.actionError = 'Could not start the billing portal session. Please try again or contact support.';
        }
      },
      error: (err) => {
        this.billingPortalLoading = false;
        this.actionError = err?.error?.message
          || 'Unable to open the billing portal right now. Please try again or contact support.';
      }
    });
  }

  getStatusBadgeClass(status: string): string {
    const statusMap: any = {
      'succeeded': 'badge bg-success',
      'completed': 'badge bg-success',
      'pending': 'badge bg-warning',
      'failed': 'badge bg-danger',
      'refunded': 'badge bg-secondary',
      'canceled': 'badge bg-secondary',
      'expired': 'badge bg-secondary'
    };
    return statusMap[status] || 'badge bg-secondary';
  }

  // A receipt is only meaningful for a paid transaction.
  hasReceipt(payment: any): boolean {
    return !!payment && ['succeeded', 'completed'].includes(payment.status);
  }

  // Open the Stripe receipt for a payment. The tab is opened synchronously on
  // click (before the async lookup) so the popup blocker doesn't kill it; we
  // then point it at the resolved receipt URL. If the receipt is already cached
  // on the record we use it directly.
  viewReceipt(payment: any): void {
    if (!payment?._id) return;
    if (payment.receiptUrl) {
      window.open(payment.receiptUrl, '_blank');
      return;
    }
    const win = window.open('', '_blank');
    this.receiptLoading[payment._id] = true;
    this.actionError = '';
    this.paymentService.getPaymentReceipt(payment._id).subscribe({
      next: (res) => {
        this.receiptLoading[payment._id] = false;
        payment.receiptUrl = res.url;
        if (win && !win.closed) {
          win.location.href = res.url;
        } else {
          window.open(res.url, '_blank');
        }
      },
      error: (err) => {
        this.receiptLoading[payment._id] = false;
        if (win && !win.closed) win.close();
        this.actionError = err?.error?.message || 'Receipt is not available for this transaction yet.';
      }
    });
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
