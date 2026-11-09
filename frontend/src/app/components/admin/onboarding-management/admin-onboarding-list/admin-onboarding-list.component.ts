import { getAppTimezone } from '../../../../services/timezone.service';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { OnboardingHubService, AdminOnboardingOverviewRow } from '../../../../services/onboarding-hub.service';
import { ApaEditService, AdminApaEditRequestRow } from '../../../../services/apa-edit.service';

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

  // APA edit requests tab
  activeTab: 'documents' | 'edit-requests' = 'documents';
  editRequests: AdminApaEditRequestRow[] = [];
  editCounts: Record<string, number> = {};
  editStatusFilter = 'pending';
  editLoading = false;
  editError = '';
  editSuccess = '';
  actionAppId = '';
  expandedAppId = '';

  // Deny modal
  denyTarget: AdminApaEditRequestRow | null = null;
  denyNote = '';

  constructor(
    private onboardingHubService: OnboardingHubService,
    private apaEditService: ApaEditService,
    private route: ActivatedRoute,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.loadOnboardings();
    this.loadEditRequests();
    if (this.route.snapshot.queryParamMap.get('tab') === 'edit-requests') {
      this.activeTab = 'edit-requests';
    }
  }

  setTab(tab: 'documents' | 'edit-requests'): void {
    this.activeTab = tab;
    this.router.navigate([], { queryParams: { tab: tab === 'edit-requests' ? tab : null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  loadEditRequests(): void {
    this.editLoading = true;
    this.editError = '';
    this.apaEditService.listEditRequests(this.editStatusFilter).subscribe({
      next: (res) => {
        this.editRequests = res.requests || [];
        this.editCounts = res.counts || {};
        this.editLoading = false;
      },
      error: (err) => {
        this.editError = err.error?.message || 'Failed to load edit requests';
        this.editLoading = false;
      }
    });
  }

  onEditFilterChange(status: string): void {
    this.editStatusFilter = status;
    this.loadEditRequests();
  }

  approveEdit(row: AdminApaEditRequestRow): void {
    this.runEditAction(row, this.apaEditService.approve(row.applicationId), `Edit access granted to ${row.agent.name}`);
  }

  lockEdit(row: AdminApaEditRequestRow): void {
    if (!confirm(`Lock ${row.agent.name}'s application? They will no longer be able to edit it.`)) return;
    this.runEditAction(row, this.apaEditService.lock(row.applicationId), `${row.agent.name}'s application locked`);
  }

  openDeny(row: AdminApaEditRequestRow): void {
    this.denyTarget = row;
    this.denyNote = '';
  }

  closeDeny(): void {
    this.denyTarget = null;
    this.denyNote = '';
  }

  confirmDeny(): void {
    if (!this.denyTarget) return;
    const row = this.denyTarget;
    this.runEditAction(row, this.apaEditService.deny(row.applicationId, this.denyNote), `Edit request from ${row.agent.name} denied`);
    this.closeDeny();
  }

  private runEditAction(row: AdminApaEditRequestRow, call: any, successMsg: string): void {
    this.actionAppId = row.applicationId;
    this.editError = '';
    this.editSuccess = '';
    call.subscribe({
      next: () => {
        this.editSuccess = successMsg;
        this.actionAppId = '';
        this.loadEditRequests();
      },
      error: (err: any) => {
        this.editError = err.error?.message || 'Action failed';
        this.actionAppId = '';
      }
    });
  }

  toggleHistory(appId: string): void {
    this.expandedAppId = this.expandedAppId === appId ? '' : appId;
  }

  getEditBadgeClass(status: string): string {
    switch (status) {
      case 'pending': return 'badge bg-warning text-dark';
      case 'approved': return 'badge bg-success';
      case 'denied': return 'badge bg-danger';
      case 'locked': return 'badge bg-secondary';
      default: return 'badge bg-light text-dark';
    }
  }

  get pendingEditCount(): number {
    return this.editCounts['pending'] || 0;
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
