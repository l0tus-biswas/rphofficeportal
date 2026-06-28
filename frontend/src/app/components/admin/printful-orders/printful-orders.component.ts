import { getAppTimezone } from '../../../services/timezone.service';
import { Component, OnInit } from '@angular/core';
import { BusinessCardsService, AdminOrderRecord } from '../../../services/business-cards.service';

@Component({
  selector: 'app-printful-orders',
  templateUrl: './printful-orders.component.html',
  styleUrls: ['./printful-orders.component.css']
})
export class PrintfulOrdersComponent implements OnInit {
  orders: AdminOrderRecord[] = [];
  loading = true;
  error = '';

  // Filters
  filterStatus = 'all';
  filterPayment = 'all';
  searchQuery = '';

  // Pagination
  currentPage = 1;
  totalPages = 1;
  totalOrders = 0;

  // Counts
  counts = { pending: 0, approved: 0, rejected: 0, total: 0 };

  // Selected order detail
  selectedOrder: AdminOrderRecord | null = null;
  showDetail = false;

  // Receipt modal
  receipt: any = null;
  loadingReceipt = false;
  showReceipt = false;

  // Action states
  actionLoading = '';
  actionError = '';
  actionSuccess = '';
  notesInput = '';

  constructor(private svc: BusinessCardsService) {}

  ngOnInit(): void {
    this.loadOrders();
  }

  loadOrders(): void {
    this.loading = true;
    this.error = '';

    const params: any = {
      page: this.currentPage,
      limit: 20
    };
    if (this.filterStatus !== 'all') params.adminStatus = this.filterStatus;
    if (this.filterPayment !== 'all') params.paymentStatus = this.filterPayment;
    if (this.searchQuery.trim()) params.search = this.searchQuery.trim();

    this.svc.getAdminOrders(params).subscribe({
      next: (res) => {
        this.orders = res.orders;
        this.totalOrders = res.total;
        this.totalPages = res.pages;
        this.counts = res.counts;
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to load orders.';
        this.loading = false;
      }
    });
  }

  applyFilter(): void {
    this.currentPage = 1;
    this.loadOrders();
  }

  changePage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.loadOrders();
  }

  viewOrder(order: AdminOrderRecord): void {
    this.selectedOrder = order;
    this.showDetail = true;
    this.notesInput = order.adminNotes || '';
    this.actionError = '';
    this.actionSuccess = '';
  }

  closeDetail(): void {
    this.showDetail = false;
    this.selectedOrder = null;
  }

  approveOrder(order: AdminOrderRecord): void {
    this.actionLoading = order.id;
    this.actionError = '';
    this.svc.approveOrder(order.id, this.notesInput || undefined).subscribe({
      next: () => {
        this.actionSuccess = 'Order approved successfully.';
        this.actionLoading = '';
        this.loadOrders();
        if (this.selectedOrder?.id === order.id) {
          this.selectedOrder.adminStatus = 'approved';
        }
        setTimeout(() => this.actionSuccess = '', 3000);
      },
      error: (err) => {
        this.actionError = err?.error?.message || 'Failed to approve order.';
        this.actionLoading = '';
      }
    });
  }

  rejectOrder(order: AdminOrderRecord): void {
    if (!confirm('Reject this order? If paid, a refund will be initiated.')) return;
    this.actionLoading = order.id;
    this.actionError = '';
    this.svc.rejectOrder(order.id, this.notesInput || undefined).subscribe({
      next: () => {
        this.actionSuccess = 'Order rejected.';
        this.actionLoading = '';
        this.loadOrders();
        if (this.selectedOrder?.id === order.id) {
          this.selectedOrder.adminStatus = 'rejected';
        }
        setTimeout(() => this.actionSuccess = '', 3000);
      },
      error: (err) => {
        this.actionError = err?.error?.message || 'Failed to reject order.';
        this.actionLoading = '';
      }
    });
  }

  deleteOrder(order: AdminOrderRecord): void {
    if (!confirm('Delete this order? This action cannot be undone.')) return;
    this.actionLoading = order.id;
    this.svc.deleteOrder(order.id).subscribe({
      next: () => {
        this.actionSuccess = 'Order deleted.';
        this.actionLoading = '';
        this.showDetail = false;
        this.selectedOrder = null;
        this.loadOrders();
        setTimeout(() => this.actionSuccess = '', 3000);
      },
      error: (err) => {
        this.actionError = err?.error?.message || 'Failed to delete order.';
        this.actionLoading = '';
      }
    });
  }

  saveNotes(order: AdminOrderRecord): void {
    this.actionLoading = order.id;
    this.svc.updateOrderNotes(order.id, this.notesInput).subscribe({
      next: () => {
        this.actionSuccess = 'Notes saved.';
        this.actionLoading = '';
        order.adminNotes = this.notesInput;
        setTimeout(() => this.actionSuccess = '', 3000);
      },
      error: (err) => {
        this.actionError = err?.error?.message || 'Failed to save notes.';
        this.actionLoading = '';
      }
    });
  }

  viewReceipt(order: AdminOrderRecord): void {
    this.loadingReceipt = true;
    this.showReceipt = true;
    this.receipt = null;

    this.svc.getOrderReceipt(order.id).subscribe({
      next: (res) => {
        this.receipt = res.receipt;
        this.loadingReceipt = false;
      },
      error: (err) => {
        this.loadingReceipt = false;
        this.showReceipt = false;
        this.actionError = 'Failed to load receipt.';
      }
    });
  }

  closeReceipt(): void {
    this.showReceipt = false;
    this.receipt = null;
  }

  getStatusClass(status: string): string {
    const map: { [key: string]: string } = {
      'pending_review': 'bg-warning text-dark',
      'approved': 'bg-success',
      'rejected': 'bg-danger',
      'deleted': 'bg-dark',
      'paid': 'bg-success',
      'unpaid': 'bg-secondary',
      'pending': 'bg-warning text-dark',
      'refunded': 'bg-info',
      'failed': 'bg-danger',
      'draft': 'bg-warning text-dark',
      'not_submitted': 'bg-secondary',
      'inprocess': 'bg-primary',
      'fulfilled': 'bg-success',
      'canceled': 'bg-danger'
    };
    return map[status] || 'bg-secondary';
  }

  getStatusLabel(status: string): string {
    const map: { [key: string]: string } = {
      'pending_review': 'Pending Review',
      'approved': 'Approved',
      'rejected': 'Rejected',
      'deleted': 'Deleted',
      'paid': 'Paid',
      'unpaid': 'Unpaid',
      'pending': 'Processing',
      'refunded': 'Refunded',
      'failed': 'Failed',
      'draft': 'Draft',
      'not_submitted': 'Not Submitted',
      'inprocess': 'In Process',
      'fulfilled': 'Fulfilled',
      'canceled': 'Canceled'
    };
    return map[status] || status;
  }

  formatDate(date: any): string {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-US', { timeZone: getAppTimezone(),  year: 'numeric', month: 'short', day: 'numeric' });
  }

  formatDateTime(date: any): string {
    if (!date) return '—';
    return new Date(date).toLocaleString('en-US', { timeZone: getAppTimezone(),  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  toUpper(val: string): string {
    return val ? val.toUpperCase() : '';
  }

  /** Best available order image: stable mockup, falling back to the product thumbnail. */
  orderImg(order: AdminOrderRecord): string {
    if ((order as any)._triedThumb) return order.product?.thumbnail || '';
    return order.mockupUrl || order.product?.thumbnail || '';
  }

  /** On image load failure, try the product thumbnail once, then the placeholder. */
  onOrderImgError(order: AdminOrderRecord): void {
    const o = order as any;
    const thumb = order.product?.thumbnail;
    if (!o._triedThumb && order.mockupUrl && thumb && thumb !== order.mockupUrl) {
      o._triedThumb = true;
    } else {
      order.imgFailed = true;
    }
  }

  /** True once we've exhausted both image sources (or there were none). */
  orderImgMissing(order: AdminOrderRecord): boolean {
    return !!order.imgFailed || (!order.mockupUrl && !order.product?.thumbnail);
  }
}
