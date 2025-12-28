import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ApaService } from '../../../services/apa.service';

@Component({
  selector: 'app-admin-apa-list',
  templateUrl: './admin-apa-list.component.html',
  styleUrls: ['./admin-apa-list.component.css']
})
export class AdminApaListComponent implements OnInit {
  applications: any[] = [];
  loading = false;
  error = '';
  
  // Filters
  statusFilter = 'all';
  searchQuery = '';
  currentPage = 1;
  totalPages = 1;
  total = 0;
  
  // Stats
  statusCounts: any = {};

  constructor(
    private apaService: ApaService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadApplications();
  }

  loadApplications(): void {
    this.loading = true;
    this.error = '';
    
    const params = {
      status: this.statusFilter !== 'all' ? this.statusFilter : undefined,
      search: this.searchQuery || undefined,
      page: this.currentPage,
      limit: 20
    };
    
    this.apaService.getApplications(params).subscribe({
      next: (response) => {
        this.loading = false;
        this.applications = response.applications;
        this.total = response.pagination.total;
        this.currentPage = response.pagination.page;
        this.totalPages = response.pagination.pages;
        this.statusCounts = response.statusCounts || {};
      },
      error: (error) => {
        this.loading = false;
        this.error = error.error?.message || 'Failed to load applications';
      }
    });
  }

  applyFilters(): void {
    this.currentPage = 1;
    this.loadApplications();
  }

  changePage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.loadApplications();
    }
  }

  viewApplication(id: string): void {
    this.router.navigate(['/admin/apa-applications', id]);
  }

  getStatusBadgeClass(status: string): string {
    const classes: any = {
      'pending_signature': 'bg-warning',
      'pending_payment': 'bg-info',
      'active': 'bg-success',
      'rejected': 'bg-danger'
    };
    return classes[status] || 'bg-secondary';
  }

  getStatusLabel(status: string): string {
    const labels: any = {
      'pending_signature': 'Pending Signature',
      'pending_payment': 'Pending Payment',
      'active': 'Active',
      'rejected': 'Rejected'
    };
    return labels[status] || status;
  }
}
