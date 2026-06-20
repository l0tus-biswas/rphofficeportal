import { Component, OnInit } from '@angular/core';
import { CarrierService, Carrier } from '../../../services/carrier.service';

@Component({
  selector: 'app-carriers',
  templateUrl: './carriers.component.html',
  styleUrls: ['./carriers.component.css']
})
export class CarriersComponent implements OnInit {
  carriers: Carrier[] = [];
  filteredCarriers: Carrier[] = [];
  filterCategory = '';
  sortField: 'name' | 'status' | '' = '';
  sortDirection: 'asc' | 'desc' = 'asc';
  loading = true;
  error = '';
  success = '';

  // Form
  showForm = false;
  editMode = false;
  currentCarrier: Partial<Carrier> = {};
  levelGuideFile: File | null = null;

  readonly CATEGORIES = [
    'Life Insurance',
    'Health Insurance',
    'Medicare',
    'Supplemental Insurance'
  ];

  constructor(private carrierService: CarrierService) {}

  ngOnInit(): void {
    this.loadCarriers();
  }

  loadCarriers(): void {
    this.loading = true;
    this.error = '';

    this.carrierService.getAllCarriers(false).subscribe({
      next: (carriers) => {
        this.carriers = carriers;
        this.applyFilter();
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading carriers:', error);
        this.error = 'Failed to load carriers';
        this.loading = false;
      }
    });
  }

  applyFilter(): void {
    this.filteredCarriers = this.filterCategory
      ? this.carriers.filter(c => c.category && c.category.includes(this.filterCategory))
      : [...this.carriers];
    this.applySort();
  }

  toggleSort(field: 'name' | 'status'): void {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = 'asc';
    }
    this.applySort();
  }

  applySort(): void {
    if (!this.sortField) return;
    const dir = this.sortDirection === 'asc' ? 1 : -1;
    this.filteredCarriers.sort((a, b) => {
      if (this.sortField === 'name') {
        return dir * a.name.localeCompare(b.name);
      }
      if (this.sortField === 'status') {
        return dir * (Number(b.isActive) - Number(a.isActive));
      }
      return 0;
    });
  }

  openNewForm(): void {
    this.showForm = true;
    this.editMode = false;
    this.currentCarrier = {
      name: '', category: [], isActive: true, notes: ''
    };
    this.levelGuideFile = null;
  }

  editCarrier(carrier: Carrier): void {
    this.showForm = true;
    this.editMode = true;
    this.currentCarrier = {
      ...carrier,
      category: carrier.category ? [...carrier.category] : []
    };
    this.levelGuideFile = null;
  }

  cancelForm(): void {
    this.showForm = false;
    this.editMode = false;
    this.currentCarrier = {};
    this.levelGuideFile = null;
  }

  toggleCategory(cat: string): void {
    if (!this.currentCarrier.category) this.currentCarrier.category = [];
    const idx = this.currentCarrier.category.indexOf(cat);
    if (idx > -1) {
      this.currentCarrier.category.splice(idx, 1);
    } else {
      this.currentCarrier.category.push(cat);
    }
  }

  isCategorySelected(cat: string): boolean {
    return !!this.currentCarrier.category && this.currentCarrier.category.includes(cat);
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.levelGuideFile = input.files && input.files.length > 0 ? input.files[0] : null;
  }

  saveCarrier(): void {
    if (!this.currentCarrier.name) { this.error = 'Carrier name is required'; return; }
    if (!this.currentCarrier.category || this.currentCarrier.category.length === 0) { this.error = 'At least one carrier category is required'; return; }

    const formData = new FormData();
    formData.append('name', this.currentCarrier.name);
    formData.append('category', JSON.stringify(this.currentCarrier.category));
    formData.append('isActive', String(this.currentCarrier.isActive ?? true));
    if (this.currentCarrier.contractingLink) formData.append('contractingLink', this.currentCarrier.contractingLink);
    if (this.currentCarrier.contractingInstructions) formData.append('contractingInstructions', this.currentCarrier.contractingInstructions);
    if (this.currentCarrier.whatToExpect) formData.append('whatToExpect', this.currentCarrier.whatToExpect);
    if (this.currentCarrier.notes !== undefined) formData.append('notes', this.currentCarrier.notes || '');
    if (this.levelGuideFile) formData.append('levelGuideFile', this.levelGuideFile);

    const op = this.editMode && this.currentCarrier._id
      ? this.carrierService.updateCarrier(this.currentCarrier._id, formData)
      : this.carrierService.createCarrier(formData);

    op.subscribe({
      next: () => {
        this.success = this.editMode ? 'Carrier updated successfully' : 'Carrier added successfully';
        this.cancelForm();
        this.loadCarriers();
        setTimeout(() => this.success = '', 4000);
      },
      error: (error) => {
        console.error('Error saving carrier:', error);
        this.error = error.error?.message || 'Failed to save carrier';
      }
    });
  }

  deleteCarrier(id: string | undefined): void {
    if (!id) { this.error = 'Invalid carrier ID'; return; }
    if (!confirm('Are you sure you want to delete this carrier? This will mark it as inactive.')) return;

    this.carrierService.deleteCarrier(id).subscribe({
      next: () => {
        this.success = 'Carrier deleted successfully';
        this.loadCarriers();
        setTimeout(() => this.success = '', 3000);
      },
      error: (error) => {
        console.error('Error deleting carrier:', error);
        this.error = error.error?.message || 'Failed to delete carrier';
      }
    });
  }

  getGuideUrl(path: string): string {
    return `${window.location.origin.replace('4200', '3000')}/${path}`;
  }
}
