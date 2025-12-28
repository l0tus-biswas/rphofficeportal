import { Component, OnInit } from '@angular/core';
import { ProductionService, ProductionSubmission, ProductionFilters, PRODUCT_TYPES } from '../../services/production.service';
import { CarrierService, Carrier } from '../../services/carrier.service';
import { AuthService } from '../../services/auth.service';
import { AdminService } from '../../services/admin.service';
import { User } from '../../models/user.model';

@Component({
  selector: 'app-production',
  templateUrl: './production.component.html',
  styleUrls: ['./production.component.css']
})
export class ProductionComponent implements OnInit {
  submissions: ProductionSubmission[] = [];
  carriers: Carrier[] = [];
  agents: User[] = [];
  
  loading = true;
  error = '';
  success = '';
  isAdmin = false;
  
  // Pagination
  currentPage = 1;
  totalPages = 1;
  totalSubmissions = 0;
  
  // Filters
  filters: ProductionFilters = {
    page: 1,
    limit: 20
  };
  
  // Product types
  productTypes = PRODUCT_TYPES;
  
  // Form for new/edit submission
  showForm = false;
  editMode = false;
  currentSubmission: Partial<ProductionSubmission> = {};
  
  // Stats
  stats: any = null;

  constructor(
    private productionService: ProductionService,
    private carrierService: CarrierService,
    private authService: AuthService,
    private adminService: AdminService
  ) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    this.isAdmin = user?.role === 'admin';
    
    this.loadCarriers();
    if (this.isAdmin) {
      this.loadAgents();
    }
    this.loadSubmissions();
    this.loadStats();
  }

  loadSubmissions(): void {
    this.loading = true;
    this.error = '';
    
    this.productionService.getProductionSubmissions(this.filters).subscribe({
      next: (response) => {
        this.submissions = response.submissions;
        this.currentPage = response.pagination.page;
        this.totalPages = response.pagination.pages;
        this.totalSubmissions = response.pagination.total;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading submissions:', error);
        this.error = 'Failed to load production submissions';
        this.loading = false;
      }
    });
  }

  loadCarriers(): void {
    this.carrierService.getAllCarriers(true).subscribe({
      next: (carriers) => {
        this.carriers = carriers;
      },
      error: (error) => {
        console.error('Error loading carriers:', error);
      }
    });
  }

  loadAgents(): void {
    this.adminService.getAllAgents().subscribe({
      next: (agents: User[]) => {
        this.agents = agents;
      },
      error: (error: any) => {
        console.error('Error loading agents:', error);
      }
    });
  }

  loadStats(): void {
    const statsFilters: any = {};
    if (this.filters.agentId) statsFilters.agentId = this.filters.agentId;
    if (this.filters.startDate) statsFilters.startDate = this.filters.startDate;
    if (this.filters.endDate) statsFilters.endDate = this.filters.endDate;
    
    this.productionService.getProductionStats(statsFilters).subscribe({
      next: (stats) => {
        this.stats = stats;
      },
      error: (error) => {
        console.error('Error loading stats:', error);
      }
    });
  }

  applyFilters(): void {
    this.filters.page = 1;
    this.loadSubmissions();
    this.loadStats();
  }

  clearFilters(): void {
    this.filters = { page: 1, limit: 20 };
    this.loadSubmissions();
    this.loadStats();
  }

  changePage(page: number): void {
    this.filters.page = page;
    this.loadSubmissions();
  }

  openNewSubmissionForm(): void {
    this.showForm = true;
    this.editMode = false;
    this.currentSubmission = {
      submissionDate: new Date(),
      clientName: '',
      productSold: '',
      carrier: '',
      premiumAmount: 0,
      notes: ''
    };
  }

  editSubmission(submission: ProductionSubmission): void {
    this.showForm = true;
    this.editMode = true;
    this.currentSubmission = { ...submission, carrier: submission.carrier._id };
  }

  cancelForm(): void {
    this.showForm = false;
    this.editMode = false;
    this.currentSubmission = {};
  }

  saveSubmission(): void {
    if (!this.currentSubmission.clientName || !this.currentSubmission.productSold || 
        !this.currentSubmission.carrier || !this.currentSubmission.premiumAmount) {
      this.error = 'Please fill in all required fields';
      return;
    }
    
    if (this.currentSubmission.productSold === 'Other' && !this.currentSubmission.productOtherDescription) {
      this.error = 'Please provide a description for "Other" product type';
      return;
    }
    
    if (this.editMode && this.currentSubmission._id) {
      this.productionService.updateProductionSubmission(
        this.currentSubmission._id,
        this.currentSubmission
      ).subscribe({
        next: () => {
          this.success = 'Submission updated successfully';
          this.cancelForm();
          this.loadSubmissions();
          this.loadStats();
          setTimeout(() => this.success = '', 3000);
        },
        error: (error) => {
          console.error('Error updating submission:', error);
          this.error = 'Failed to update submission';
        }
      });
    } else {
      this.productionService.createProductionSubmission(this.currentSubmission).subscribe({
        next: () => {
          this.success = 'Submission created successfully';
          this.cancelForm();
          this.loadSubmissions();
          this.loadStats();
          setTimeout(() => this.success = '', 3000);
        },
        error: (error) => {
          console.error('Error creating submission:', error);
          this.error = 'Failed to create submission';
        }
      });
    }
  }

  deleteSubmission(id: string): void {
    if (!confirm('Are you sure you want to delete this submission?')) return;
    
    this.productionService.deleteProductionSubmission(id).subscribe({
      next: () => {
        this.success = 'Submission deleted successfully';
        this.loadSubmissions();
        this.loadStats();
        setTimeout(() => this.success = '', 3000);
      },
      error: (error) => {
        console.error('Error deleting submission:', error);
        this.error = 'Failed to delete submission';
      }
    });
  }

  formatDate(date: any): string {
    if (!date) return '';
    return new Date(date).toLocaleDateString();
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  getStatusBadgeClass(status: string): string {
    const classes: any = {
      'submitted': 'bg-info',
      'pending': 'bg-warning',
      'approved': 'bg-success',
      'rejected': 'bg-danger',
      'paid': 'bg-primary'
    };
    return classes[status] || 'bg-secondary';
  }
}
