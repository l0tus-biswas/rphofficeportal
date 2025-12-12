import { Component, OnInit } from '@angular/core';
import { AgentService } from '../../services/agent.service';

@Component({
  selector: 'app-recruits',
  templateUrl: './recruits.component.html',
  styleUrls: ['./recruits.component.css']
})
export class RecruitsComponent implements OnInit {
  recruits: any[] = [];
  stats: any = { total: 0, active: 0, inactive: 0, filtered: 0 };
  loading = false;
  error = '';
  
  // Filters
  statusFilter = 'all';
  searchTerm = '';
  sortBy = '-createdAt';
  
  // Pagination
  currentPage = 1;
  pageSize = 12;
  totalPages = 1;

  constructor(private agentService: AgentService) { }

  ngOnInit(): void {
    this.loadRecruits();
  }

  loadRecruits(): void {
    this.loading = true;
    this.error = '';
    
    const params = {
      page: this.currentPage,
      limit: this.pageSize,
      status: this.statusFilter !== 'all' ? this.statusFilter : undefined,
      search: this.searchTerm || undefined,
      sortBy: this.sortBy
    };
    
    this.agentService.getRecruits(params).subscribe({
      next: (response: any) => {
        this.recruits = response.recruits || [];
        this.stats = response.stats || { total: 0, active: 0, inactive: 0, filtered: 0 };
        this.totalPages = response.pagination?.pages || 1;
        this.loading = false;
      },
      error: (error: any) => {
        this.error = error.error?.message || 'Failed to load recruits';
        this.loading = false;
      }
    });
  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.loadRecruits();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadRecruits();
  }

  onSortChange(sortBy: string): void {
    this.sortBy = sortBy;
    this.currentPage = 1;
    this.loadRecruits();
  }

  getStatusBadgeClass(isActive: boolean): string {
    return isActive ? 'bg-success' : 'bg-secondary';
  }

  getStatusText(isActive: boolean): string {
    return isActive ? 'Active' : 'Inactive';
  }

  copiedCode: string | null = null;

  getRoleIcon(role: string): string {
    const icons: any = {
      'admin': 'bi-shield-fill-check',
      'agent': 'bi-briefcase-fill',
      'recruit': 'bi-person-fill'
    };
    return icons[role] || 'bi-person';
  }

  copyToClipboard(code: string): void {
    const baseUrl = window.location.origin;
    const fullUrl = `${baseUrl}/apply?ref=${code}`;
    
    navigator.clipboard.writeText(fullUrl).then(() => {
      this.copiedCode = code;
      setTimeout(() => {
        this.copiedCode = null;
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  }
}
