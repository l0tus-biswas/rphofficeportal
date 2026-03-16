import { Component, OnInit } from '@angular/core';
import { CarrierService, Carrier, ProductFactor } from '../../../services/carrier.service';

@Component({
  selector: 'app-carriers',
  templateUrl: './carriers.component.html',
  styleUrls: ['./carriers.component.css']
})
export class CarriersComponent implements OnInit {
  carriers: Carrier[] = [];
  filteredCarriers: Carrier[] = [];
  filterCategory = '';
  loading = true;
  error = '';
  success = '';

  // Form
  showForm = false;
  editMode = false;
  currentCarrier: Partial<Carrier> & { newProductFactor?: ProductFactor } = {};
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
      ? this.carriers.filter(c => c.category === this.filterCategory)
      : [...this.carriers];
  }

  openNewForm(): void {
    this.showForm = true;
    this.editMode = false;
    this.currentCarrier = {
      name: '', category: 'Life Insurance', isActive: true, notes: '',
      productFactors: [], newProductFactor: { productName: '', factor: null, level: '' }
    };
    this.levelGuideFile = null;
  }

  editCarrier(carrier: Carrier): void {
    this.showForm = true;
    this.editMode = true;
    this.currentCarrier = {
      ...carrier,
      productFactors: carrier.productFactors ? [...carrier.productFactors] : [],
      newProductFactor: { productName: '', factor: null, level: '' }
    };
    this.levelGuideFile = null;
  }

  cancelForm(): void {
    this.showForm = false;
    this.editMode = false;
    this.currentCarrier = {};
    this.levelGuideFile = null;
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.levelGuideFile = input.files && input.files.length > 0 ? input.files[0] : null;
  }

  addProductFactor(): void {
    const pf = this.currentCarrier.newProductFactor;
    if (!pf || !pf.productName) return;
    if (!this.currentCarrier.productFactors) this.currentCarrier.productFactors = [];
    this.currentCarrier.productFactors.push({ productName: pf.productName, factor: pf.factor ?? null, level: pf.level || '' });
    this.currentCarrier.newProductFactor = { productName: '', factor: null, level: '' };
  }

  removeProductFactor(index: number): void {
    this.currentCarrier.productFactors?.splice(index, 1);
  }

  saveCarrier(): void {
    if (!this.currentCarrier.name) { this.error = 'Carrier name is required'; return; }
    if (!this.currentCarrier.category) { this.error = 'Carrier category is required'; return; }

    const formData = new FormData();
    formData.append('name', this.currentCarrier.name);
    formData.append('category', this.currentCarrier.category);
    formData.append('isActive', String(this.currentCarrier.isActive ?? true));
    if (this.currentCarrier.factor != null) formData.append('factor', String(this.currentCarrier.factor));
    if (this.currentCarrier.productFactors?.length) {
      formData.append('productFactors', JSON.stringify(this.currentCarrier.productFactors));
    }
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
