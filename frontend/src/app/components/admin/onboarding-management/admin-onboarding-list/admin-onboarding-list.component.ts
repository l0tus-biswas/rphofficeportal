import { getAppTimezone } from '../../../../services/timezone.service';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { OnboardingHubService, AdminOnboardingOverviewRow } from '../../../../services/onboarding-hub.service';

@Component({
  selector: 'app-admin-onboarding-list',
  templateUrl: './admin-onboarding-list.component.html',
  styleUrls: ['./admin-onboarding-list.component.css']
})
export class AdminOnboardingListComponent implements OnInit {
  onboardings: AdminOnboardingOverviewRow[] = [];
  loading = true;
  error = '';
  
  // Expose Math to template
  Math = Math;
  
  // Pagination
  currentPage = 1;
  pageSize = 20;
  totalItems = 0;
  totalPages = 0;
  
  // Filters
  statusFilter = '';
  searchQuery = '';
  
  // Stats
  stats = {
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    missing: 0,
    notStarted: 0
  };

  statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'not-started', label: 'Not Started' },
    { value: 'pending', label: 'Pending Review' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'missing', label: 'Missing Documents' }
  ];

  constructor(
    private onboardingHubService: OnboardingHubService,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.loadOnboardings();
  }

  loadOnboardings(): void {
    this.loading = true;
    this.error = '';
    
    this.onboardingHubService.getAdminOverview(
      this.currentPage,
      this.pageSize,
      this.statusFilter || undefined,
      this.searchQuery || undefined
    ).subscribe({
      next: (response) => {
        this.onboardings = response.rows || [];
        this.totalItems = response.pagination.total;
        this.totalPages = response.pagination.pages;
        this.loading = false;
        this.calculateStats();
      },
      error: (error) => {
        this.error = error.error?.message || 'Failed to load onboardings';
        this.loading = false;
      }
    });
  }

  calculateStats(): void {
    this.stats.total = this.onboardings.length;
    this.stats.pending = this.onboardings.filter(o => o.status === 'pending').length;
    this.stats.approved = this.onboardings.filter(o => o.status === 'approved').length;
    this.stats.rejected = this.onboardings.filter(o => o.status === 'rejected').length;
    this.stats.missing = this.onboardings.filter(o => o.status === 'missing').length;
    this.stats.notStarted = this.onboardings.filter(o => o.status === 'not-started').length;
  }

  onSearch(): void {
    this.currentPage = 1;
    this.loadOnboardings();
  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.loadOnboardings();
  }

  clearFilters(): void {
    this.statusFilter = '';
    this.searchQuery = '';
    this.currentPage = 1;
    this.loadOnboardings();
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.loadOnboardings();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadOnboardings();
    }
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadOnboardings();
    }
  }

  viewDetails(userId?: string): void {
    if (!userId) return;
    this.router.navigate(['/admin/onboarding', userId]);
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'approved': return 'badge bg-success';
      case 'rejected': return 'badge bg-danger';
      case 'missing': return 'badge bg-warning text-dark';
      case 'pending': return 'badge bg-info';
      default: return 'badge bg-secondary';
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'approved': return 'bi-check-circle-fill';
      case 'rejected': return 'bi-x-circle-fill';
      case 'missing': return 'bi-exclamation-triangle-fill';
      case 'pending': return 'bi-clock-fill';
      default: return 'bi-circle';
    }
  }

  getCompletedSteps(onboarding: AdminOnboardingOverviewRow): number {
    return onboarding.uploadedRequired || 0;
  }

  getTotalRequired(onboarding: AdminOnboardingOverviewRow): number {
    return onboarding.totalRequired || 0;
  }

  formatDate(date: any): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', { timeZone: getAppTimezone(), 
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  getPaginationRange(): number[] {
    const range: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(this.totalPages, start + maxVisible - 1);
    
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    
    for (let i = start; i <= end; i++) {
      range.push(i);
    }
    
    return range;
  }

  deleteOnboarding(userId?: string, userName = 'this user'): void {
    if (!userId) return;
    alert(`Delete action is not available in this list for onboarding-hub records. Open ${userName}'s detail page for document-level management.`);
  }
}
