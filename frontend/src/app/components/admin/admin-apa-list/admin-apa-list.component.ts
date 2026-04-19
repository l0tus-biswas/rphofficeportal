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

  // Auto-approve setting (§23.3)
  autoApprove = false;
  autoApproveLoading = false;

  // APA Template Management
  templateInfo: any = null;
  templateLoading = false;
  templateUploading = false;
  templateFile: File | null = null;
  uploadMode: string = 'replace';
  templateError = '';
  templateSuccess = '';
  showTemplateSection = false;

  constructor(
    private apaService: ApaService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadApplications();
    this.loadAutoApproveSetting();
    this.loadTemplateInfo();
  }

  loadAutoApproveSetting(): void {
    this.apaService.getAutoApproveSetting().subscribe({
      next: (res) => { this.autoApprove = res.autoApprove || false; },
      error: () => {} // silently ignore if setting doesn't exist
    });
  }

  toggleAutoApprove(): void {
    this.autoApproveLoading = true;
    this.apaService.setAutoApproveSetting(!this.autoApprove).subscribe({
      next: (res) => {
        this.autoApprove = res.autoApprove;
        this.autoApproveLoading = false;
      },
      error: () => {
        this.autoApproveLoading = false;
      }
    });
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
      'completed': 'bg-primary',
      'active': 'bg-success',
      'rejected': 'bg-danger'
    };
    return classes[status] || 'bg-secondary';
  }

  getStatusLabel(status: string): string {
    const labels: any = {
      'pending_signature': 'Pending Signature',
      'pending_payment': 'Pending Payment',
      'completed': 'Awaiting Review',
      'active': 'Active',
      'rejected': 'Rejected'
    };
    return labels[status] || status;
  }

  // --- APA Template Management ---

  loadTemplateInfo(): void {
    this.templateLoading = true;
    this.apaService.getTemplateInfo().subscribe({
      next: (res) => {
        this.templateInfo = res;
        this.templateLoading = false;
      },
      error: () => {
        this.templateLoading = false;
      }
    });
  }

  onTemplateFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.templateError = '';
    this.templateSuccess = '';
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      if (file.type !== 'application/pdf') {
        this.templateError = 'Only PDF files are allowed.';
        this.templateFile = null;
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        this.templateError = 'File must be under 20MB.';
        this.templateFile = null;
        return;
      }
      this.templateFile = file;
    }
  }

  uploadTemplate(): void {
    if (!this.templateFile) return;
    this.templateUploading = true;
    this.templateError = '';
    this.templateSuccess = '';

    this.apaService.uploadTemplate(this.templateFile, this.uploadMode).subscribe({
      next: (res) => {
        this.templateSuccess = res.message || 'Template updated successfully.';
        this.templateUploading = false;
        this.templateFile = null;
        this.loadTemplateInfo();
      },
      error: (err) => {
        this.templateError = err.error?.message || 'Failed to upload template.';
        this.templateUploading = false;
      }
    });
  }

  revertTemplate(): void {
    if (!confirm('Revert to the original default APA template? This will undo any custom template.')) return;
    this.templateUploading = true;
    this.apaService.revertTemplate().subscribe({
      next: (res) => {
        this.templateSuccess = res.message || 'Reverted to default template.';
        this.templateUploading = false;
        this.loadTemplateInfo();
      },
      error: (err) => {
        this.templateError = err.error?.message || 'Failed to revert template.';
        this.templateUploading = false;
      }
    });
  }

  formatFileSize(bytes: number): string {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}
