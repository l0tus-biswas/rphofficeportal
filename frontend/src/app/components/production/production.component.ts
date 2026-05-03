import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ProductionService, ProductionSubmission, ProductionFilters, STATUS_VALUES, RankingEntry, CustomFieldDef } from '../../services/production.service';
import { CarrierService, Carrier } from '../../services/carrier.service';
import { AuthService } from '../../services/auth.service';
import { AdminService } from '../../services/admin.service';
import { ProductTypeService, ProductType } from '../../services/product-type.service';
import { User } from '../../models/user.model';
import { environment } from '../../../environments/environment';

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
    limit: 20,
    agentId: '',
    productSold: '',
    carrier: '',
    status: ''
  };
  
  // 8.5: Date preset active label
  activeDatePreset = '';

  // Product types — loaded dynamically from API
  productTypes: string[] = [];
  productCategoryMap: Record<string, string> = {};
  statusValues = STATUS_VALUES;
  
  // Form for new/edit submission
  showForm = false;
  editMode = false;
  currentSubmission: Partial<ProductionSubmission> = { customFields: {} };
  
  // Stats
  stats: any = null;

  // Team Report
  showTeamReport = false;
  teamReport: any = null;
  teamReportWindow = 30;
  teamReportLoading = false;

  // 8.7: Ranking
  showRanking = false;
  ranking: RankingEntry[] = [];
  rankingSortBy = 'premium';
  rankingWindow = 0;
  rankingLoading = false;

  // 8.2: Custom fields
  customFieldDefs: CustomFieldDef[] = [];
  showCustomFieldsConfig = false;
  editingCustomFields: CustomFieldDef[] = [];
  customFieldsSaving = false;

  constructor(
    private productionService: ProductionService,
    private carrierService: CarrierService,
    private authService: AuthService,
    private adminService: AdminService,
    private productTypeService: ProductTypeService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    this.isAdmin = user?.role === 'admin';
    
    this.loadProductTypes();
    this.loadCarriers();
    this.loadCustomFields();
    if (this.isAdmin) {
      this.loadAgents();
    }
    this.loadSubmissions();
    this.loadStats();
  }

  loadProductTypes(): void {
    this.productTypeService.getProducts(true).subscribe({
      next: (response) => {
        this.productTypes = response.products.map((p: ProductType) => p.name);
        this.productCategoryMap = {};
        response.products.forEach((p: ProductType) => {
          this.productCategoryMap[p.name] = p.category;
        });
      },
      error: () => {
        // Fallback to a basic list if the API fails
        this.productTypes = [
          'Term Life Insurance', 'Whole Life Insurance', 'Indexed Universal Life (IUL)',
          'Final Expense / Burial Insurance', 'Accident Insurance', 'Cancer Insurance',
          'Critical Illness Insurance', 'Hospital Indemnity', 'Short-Term Disability Insurance',
          'Long-Term Disability Insurance', 'Dental Insurance', 'Vision Insurance',
          'Long-Term Care Insurance', 'Medicare Advantage', 'Medicare Supplement (Medigap)',
          'ACA Marketplace Health Insurance', 'Fixed Annuities', 'Indexed Annuities', 'Other'
        ];
        this.productCategoryMap = {
          'Medicare Advantage': 'Medicare',
          'Medicare Supplement (Medigap)': 'Medicare',
          'ACA Marketplace Health Insurance': 'Health Insurance',
          'Term Life Insurance': 'Life Insurance',
          'Whole Life Insurance': 'Life Insurance',
          'Indexed Universal Life (IUL)': 'Life Insurance',
          'Final Expense / Burial Insurance': 'Life Insurance',
          'Accident Insurance': 'Supplemental Insurance',
          'Cancer Insurance': 'Supplemental Insurance',
          'Critical Illness Insurance': 'Supplemental Insurance',
          'Hospital Indemnity': 'Supplemental Insurance',
          'Short-Term Disability Insurance': 'Supplemental Insurance',
          'Long-Term Disability Insurance': 'Supplemental Insurance',
          'Dental Insurance': 'Supplemental Insurance',
          'Vision Insurance': 'Supplemental Insurance',
          'Long-Term Care Insurance': 'Supplemental Insurance',
          'Fixed Annuities': 'Retirement / Annuities',
          'Indexed Annuities': 'Retirement / Annuities',
        };
      }
    });
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
      next: (response: any) => {
        this.agents = Array.isArray(response) ? response : (response.users || []);
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
    this.filters = { page: 1, limit: 20, agentId: '', productSold: '', carrier: '', status: '' };
    this.activeDatePreset = '';
    this.loadSubmissions();
    this.loadStats();
  }

  exportCsv(): void {
    this.productionService.exportProductionCsv(this.filters).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `production-export-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: (error) => {
        console.error('Error exporting CSV:', error);
        this.error = 'Failed to export CSV';
      }
    });
  }

  changePage(page: number): void {
    this.filters.page = page;
    this.loadSubmissions();
  }

  openNewSubmissionForm(): void {
    this.showForm = true;
    this.editMode = false;
    const cf: Record<string, any> = {};
    this.customFieldDefs.forEach(d => cf[d.key] = d.type === 'checkbox' ? false : '');
    this.currentSubmission = {
      submissionDate: new Date(),
      clientName: '',
      productSold: '',
      productCategory: 'Life Insurance',
      carrier: '',
      premiumAmount: 0,
      notes: '',
      status: 'Submitted',
      numberOfMembers: 1,
      isTrainingPeriod: false,
      customFields: cf
    };
  }

  onProductChange(product: string): void {
    this.currentSubmission.productCategory = (this.productCategoryMap[product] as any) || 'Life Insurance';
  }

  editSubmission(submission: ProductionSubmission): void {
    this.showForm = true;
    this.editMode = true;
    this.currentSubmission = {
      ...submission,
      carrier: submission.carrier._id,
      customFields: submission.customFields || {}
    };
  }

  cancelForm(): void {
    this.showForm = false;
    this.editMode = false;
    this.currentSubmission = { customFields: {} };
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

  toggleTeamReport(): void {
    this.showTeamReport = !this.showTeamReport;
    if (this.showTeamReport && !this.teamReport) {
      this.loadTeamReport();
    }
  }

  loadTeamReport(): void {
    this.teamReportLoading = true;
    this.http.get<any>(`${environment.apiUrl}/production/team-report?window=${this.teamReportWindow}`).subscribe({
      next: (data) => { this.teamReport = data; this.teamReportLoading = false; },
      error: () => { this.teamReportLoading = false; }
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
      'Submitted': 'bg-info',
      'Pending': 'bg-warning',
      'In Force': 'bg-success',
      'Lapsed': 'bg-secondary',
      'Cancelled': 'bg-danger'
    };
    return classes[status] || 'bg-secondary';
  }

  getCategoryBadgeClass(category: string | undefined): string {
    const classes: any = {
      'Life Insurance':                   'bg-primary',
      'Supplemental Insurance':           'bg-info text-dark',
      'Health Insurance':                 'bg-success',
      'Medicare':                         'bg-warning text-dark',
      'Retirement / Annuities':           'bg-purple text-white',
      'Property & Casualty - Personal':   'bg-secondary',
      'Property & Casualty - Commercial': 'bg-dark'
    };
    return (category && classes[category]) || 'bg-secondary';
  }

  // --- 8.5: Date preset filters ---
  setDatePreset(preset: string): void {
    this.activeDatePreset = preset;
    const now = new Date();
    let start: Date | undefined;
    switch (preset) {
      case '30d':  start = new Date(now.getTime() - 30 * 86400000); break;
      case '60d':  start = new Date(now.getTime() - 60 * 86400000); break;
      case '90d':  start = new Date(now.getTime() - 90 * 86400000); break;
      case '6mo':  start = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()); break;
      case '12mo': start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()); break;
      default:     start = undefined; break;
    }
    this.filters.startDate = start ? start.toISOString().split('T')[0] : undefined;
    this.filters.endDate = preset === 'all' ? undefined : now.toISOString().split('T')[0];
    this.applyFilters();
  }

  // --- 8.7: Ranking ---
  toggleRanking(): void {
    this.showRanking = !this.showRanking;
    if (this.showRanking && this.ranking.length === 0) {
      this.loadRanking();
    }
  }

  loadRanking(): void {
    this.rankingLoading = true;
    this.productionService.getRanking(this.rankingSortBy, this.rankingWindow).subscribe({
      next: (data) => { this.ranking = data.ranking; this.rankingLoading = false; },
      error: () => { this.rankingLoading = false; }
    });
  }

  // --- 8.2: Custom field configuration ---
  loadCustomFields(): void {
    this.productionService.getCustomFields().subscribe({
      next: (res) => { this.customFieldDefs = res.fields; },
      error: () => {}
    });
  }

  openCustomFieldsConfig(): void {
    this.editingCustomFields = this.customFieldDefs.map(f => ({ ...f }));
    this.showCustomFieldsConfig = true;
  }

  trackCustomField(index: number): number {
    return index;
  }

  addCustomField(): void {
    this.editingCustomFields.push({ key: '', label: '', type: 'text', required: false });
  }

  removeCustomField(i: number): void {
    this.editingCustomFields.splice(i, 1);
  }

  saveCustomFieldsConfig(): void {
    // auto-generate keys from labels
    this.editingCustomFields.forEach(f => {
      if (!f.key && f.label) {
        f.key = f.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
      }
    });
    this.customFieldsSaving = true;
    this.productionService.saveCustomFields(this.editingCustomFields).subscribe({
      next: (res: any) => {
        this.customFieldDefs = res.fields || this.editingCustomFields;
        this.customFieldsSaving = false;
        this.showCustomFieldsConfig = false;
        this.success = 'Custom fields saved';
        setTimeout(() => this.success = '', 3000);
      },
      error: () => { this.customFieldsSaving = false; this.error = 'Failed to save custom fields'; }
    });
  }

  cancelCustomFieldsConfig(): void {
    this.showCustomFieldsConfig = false;
  }

  getOptionsString(f: CustomFieldDef): string {
    return (f.options || []).join(', ');
  }

  setOptionsFromString(f: CustomFieldDef, value: string): void {
    f.options = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
  }
}
