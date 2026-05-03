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
  paymentFilters = { type: '', status: '', userId: '', search: '' };
  paymentPage = 1;
  paymentLimit = 20;
  paymentTotal = 0;
  paymentPages = 0;
  
  // Subscriptions
  subscriptions: any[] = [];
  subscriptionStats: any[] = [];
  subscriptionFilter = '';
  subscriptionPage = 1;
  subscriptionLimit = 20;
  subscriptionTotal = 0;
  subscriptionPages = 0;
  
  // Settings
  paymentSettings: any = null;
  settingsLoading = false;
  savingSettings = false;
  editSettings: any = null;
  
  loading = false;
  subsLoading = false;
  error = '';
  successMsg = '';

  constructor(private paymentService: PaymentService) { }

  ngOnInit(): void {
    this.loadPaymentSettings();
    this.loadPayments();
    this.loadSubscriptions();
  }

  setTab(tab: string): void {
    this.activeTab = tab;
    this.error = '';
    this.successMsg = '';
  }

  loadPaymentSettings(): void {
    this.settingsLoading = true;
    this.paymentService.getPaymentSettings().subscribe({
      next: (response: any) => {
        this.paymentSettings = response;
        this.settingsLoading = false;
      },
      error: (error: any) => {
        console.error('Error loading payment settings:', error);
        this.settingsLoading = false;
      }
    });
  }

  loadPayments(): void {
    this.loading = true;
    this.error = '';
    this.paymentService.getAllPayments(this.paymentPage, this.paymentLimit, this.paymentFilters).subscribe({
      next: (response: any) => {
        this.payments = response.payments || [];
        this.paymentStats = response.stats || [];
        this.paymentTotal = response.pagination?.total || 0;
        this.paymentPages = response.pagination?.pages || 0;
        this.loading = false;
      },
      error: (error: any) => {
        this.error = error.error?.message || 'Failed to load payments';
        this.loading = false;
      }
    });
  }

  loadSubscriptions(): void {
    this.subsLoading = true;
    this.paymentService.getAllSubscriptions(this.subscriptionPage, this.subscriptionLimit, this.subscriptionFilter).subscribe({
      next: (response: any) => {
        this.subscriptions = response.subscriptions || [];
        this.subscriptionStats = response.stats || [];
        this.subscriptionTotal = response.pagination?.total || 0;
        this.subscriptionPages = response.pagination?.pages || 0;
        this.subsLoading = false;
      },
      error: (error: any) => {
        this.error = error.error?.message || 'Failed to load subscriptions';
        this.subsLoading = false;
      }
    });
  }

  enableAccess(sub: any): void {
    const userName = sub.user?.name || 'this user';
    const userId = sub.user?._id;
    if (!userId) return;
    if (!confirm(`Enable payment access for ${userName}?`)) return;

    this.paymentService.enablePaymentAccess(userId).subscribe({
      next: () => {
        this.successMsg = `Payment access enabled for ${userName}`;
        this.loadSubscriptions();
      },
      error: (error: any) => {
        this.error = error.error?.message || 'Failed to enable access';
      }
    });
  }

  disableAccess(sub: any): void {
    const userName = sub.user?.name || 'this user';
    const userId = sub.user?._id;
    if (!userId) return;
    if (!confirm(`Disable payment access for ${userName}?`)) return;

    this.paymentService.disablePaymentAccess(userId).subscribe({
      next: () => {
        this.successMsg = `Payment access disabled for ${userName}`;
        this.loadSubscriptions();
      },
      error: (error: any) => {
        this.error = error.error?.message || 'Failed to disable access';
      }
    });
  }

  cancelSubscription(sub: any): void {
    const userName = sub.user?.name || 'this user';
    const userId = sub.user?._id;
    if (!userId) return;
    if (!confirm(`Cancel subscription for ${userName}? This action cannot be undone.`)) return;

    this.paymentService.cancelSubscription(userId).subscribe({
      next: () => {
        this.successMsg = 'Subscription canceled successfully';
        this.loadSubscriptions();
      },
      error: (error: any) => {
        this.error = error.error?.message || 'Failed to cancel subscription';
      }
    });
  }

  applyPaymentFilters(): void {
    this.paymentPage = 1;
    this.loadPayments();
  }

  clearPaymentFilters(): void {
    this.paymentFilters = { type: '', status: '', userId: '', search: '' };
    this.paymentPage = 1;
    this.loadPayments();
  }

  applySubscriptionFilter(): void {
    this.subscriptionPage = 1;
    this.loadSubscriptions();
  }

  clearSubscriptionFilter(): void {
    this.subscriptionFilter = '';
    this.subscriptionPage = 1;
    this.loadSubscriptions();
  }

  // Pagination
  goToPaymentPage(page: number): void {
    if (page < 1 || page > this.paymentPages) return;
    this.paymentPage = page;
    this.loadPayments();
  }

  goToSubscriptionPage(page: number): void {
    if (page < 1 || page > this.subscriptionPages) return;
    this.subscriptionPage = page;
    this.loadSubscriptions();
  }

  get paymentPageNumbers(): number[] {
    const pages: number[] = [];
    const start = Math.max(1, this.paymentPage - 2);
    const end = Math.min(this.paymentPages, this.paymentPage + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  get subscriptionPageNumbers(): number[] {
    const pages: number[] = [];
    const start = Math.max(1, this.subscriptionPage - 2);
    const end = Math.min(this.subscriptionPages, this.subscriptionPage + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  // Settings
  startEditSettings(): void {
    this.editSettings = {
      oneTimePrice: (this.paymentSettings?.oneTimePrice || 0) / 100,
      monthlyPrice: (this.paymentSettings?.monthlyPrice || 0) / 100,
      monthlyPriceId: this.paymentSettings?.monthlyPriceId || ''
    };
  }

  cancelEditSettings(): void {
    this.editSettings = null;
  }

  saveSettings(): void {
    if (!this.editSettings) return;
    this.savingSettings = true;
    this.paymentService.updatePaymentSettings({
      oneTimePrice: Math.round(this.editSettings.oneTimePrice * 100),
      monthlyPrice: Math.round(this.editSettings.monthlyPrice * 100),
      monthlyPriceId: this.editSettings.monthlyPriceId
    }).subscribe({
      next: () => {
        this.successMsg = 'Payment settings updated successfully';
        this.editSettings = null;
        this.savingSettings = false;
        this.loadPaymentSettings();
      },
      error: (error: any) => {
        this.error = error.error?.message || 'Failed to update settings';
        this.savingSettings = false;
      }
    });
  }

  formatAmount(cents: number): string {
    if (!cents && cents !== 0) return '$0.00';
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
      'completed': 'badge bg-success',
      'pending': 'badge bg-warning text-dark',
      'failed': 'badge bg-danger',
      'refunded': 'badge bg-info',
      'active': 'badge bg-success',
      'past_due': 'badge bg-warning text-dark',
      'canceled': 'badge bg-secondary',
      'unpaid': 'badge bg-danger',
      'incomplete': 'badge bg-warning text-dark'
    };
    return map[status] || 'badge bg-secondary';
  }

  dismissAlert(): void {
    this.error = '';
    this.successMsg = '';
  }
}
