import { Component, OnInit } from '@angular/core';
import { PaymentService } from '../../../services/payment.service';

@Component({
  selector: 'app-admin-payment-management',
  templateUrl: './admin-payment-management.component.html',
  styleUrls: ['./admin-payment-management.component.css']
})
export class AdminPaymentManagementComponent implements OnInit {
  activeTab = 'payments';
  
  // Payments
  payments: any[] = [];
  paymentStats: any[] = [];
  paymentFilters = { type: '', status: '', userId: '' };
  paymentPage = 1;
  paymentLimit = 50;
  paymentTotal = 0;
  paymentPages = 0;
  
  // Subscriptions
  subscriptions: any[] = [];
  subscriptionStats: any[] = [];
  subscriptionFilter = '';
  subscriptionPage = 1;
  subscriptionLimit = 50;
  subscriptionTotal = 0;
  subscriptionPages = 0;
  
  // Settings
  paymentSettings: any = null;
  
  loading = true;
  error = '';

  constructor(private paymentService: PaymentService) { }

  ngOnInit(): void {
    this.loadPaymentSettings();
    this.loadPayments();
    this.loadSubscriptions();
  }

  setTab(tab: string): void {
    this.activeTab = tab;
  }

  loadPaymentSettings(): void {
    this.paymentService.getPaymentSettings().subscribe({
      next: (response: any) => {
        this.paymentSettings = response;
      },
      error: (error: any) => {
        console.error('Error loading payment settings:', error);
      }
    });
  }

  loadPayments(): void {
    this.loading = true;
    this.paymentService.getAllPayments(this.paymentPage, this.paymentLimit, this.paymentFilters).subscribe({
      next: (response: any) => {
        this.payments = response.payments || [];
        this.paymentStats = response.stats || [];
        this.paymentTotal = response.pagination.total;
        this.paymentPages = response.pagination.pages;
        this.loading = false;
      },
      error: (error: any) => {
        this.error = error.error?.message || 'Failed to load payments';
        this.loading = false;
      }
    });
  }

  loadSubscriptions(): void {
    this.paymentService.getAllSubscriptions(this.subscriptionPage, this.subscriptionLimit, this.subscriptionFilter).subscribe({
      next: (response: any) => {
        this.subscriptions = response.subscriptions || [];
        this.subscriptionStats = response.stats || [];
        this.subscriptionTotal = response.pagination.total;
        this.subscriptionPages = response.pagination.pages;
      },
      error: (error: any) => {
        console.error('Error loading subscriptions:', error);
      }
    });
  }

  enableAccess(userId: string, userName: string): void {
    if (!confirm(`Enable payment access for ${userName}?`)) {
      return;
    }

    this.paymentService.enablePaymentAccess(userId).subscribe({
      next: (response: any) => {
        alert(response.message);
        this.loadSubscriptions();
      },
      error: (error: any) => {
        alert(error.error?.message || 'Failed to enable access');
      }
    });
  }

  disableAccess(userId: string, userName: string): void {
    if (!confirm(`Disable payment access for ${userName}?`)) {
      return;
    }

    this.paymentService.disablePaymentAccess(userId).subscribe({
      next: (response: any) => {
        alert(response.message);
        this.loadSubscriptions();
      },
      error: (error: any) => {
        alert(error.error?.message || 'Failed to disable access');
      }
    });
  }

  cancelSubscription(userId: string, userName: string): void {
    if (!confirm(`Cancel subscription for ${userName}? This action cannot be undone.`)) {
      return;
    }

    this.paymentService.cancelSubscription(userId).subscribe({
      next: (response: any) => {
        alert('Subscription canceled successfully');
        this.loadSubscriptions();
      },
      error: (error: any) => {
        alert(error.error?.message || 'Failed to cancel subscription');
      }
    });
  }

  applyPaymentFilters(): void {
    this.paymentPage = 1;
    this.loadPayments();
  }

  clearPaymentFilters(): void {
    this.paymentFilters = { type: '', status: '', userId: '' };
    this.paymentPage = 1;
    this.loadPayments();
  }

  applySubscriptionFilter(): void {
    this.subscriptionPage = 1;
    this.loadSubscriptions();
  }

  formatAmount(cents: number): string {
    return '$' + (cents / 100).toFixed(2);
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  getStatusBadge(status: string): string {
    const map: any = {
      'succeeded': 'badge bg-success',
      'pending': 'badge bg-warning',
      'failed': 'badge bg-danger',
      'active': 'badge bg-success',
      'past_due': 'badge bg-warning',
      'canceled': 'badge bg-danger',
      'unpaid': 'badge bg-danger'
    };
    return map[status] || 'badge bg-secondary';
  }
}
