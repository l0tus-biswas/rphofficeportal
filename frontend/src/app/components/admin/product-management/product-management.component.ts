import { Component, OnInit } from '@angular/core';
import { ProductTypeService, ProductType, PRODUCT_CATEGORIES } from '../../../services/product-type.service';

@Component({
  selector: 'app-product-management',
  templateUrl: './product-management.component.html',
  styleUrls: ['./product-management.component.css']
})
export class ProductManagementComponent implements OnInit {
  products: ProductType[] = [];
  filteredProducts: ProductType[] = [];
  loading = false;
  error = '';
  success = '';

  showForm = false;
  editMode = false;
  currentProduct: Partial<ProductType> = {};

  categories = PRODUCT_CATEGORIES;
  filterCategory = 'all';
  filterStatus = 'active';
  searchTerm = '';

  constructor(private productTypeService: ProductTypeService) {}

  ngOnInit(): void {
    this.loadProducts();
  }

  loadProducts(): void {
    this.loading = true;
    this.error = '';

    this.productTypeService.getProducts().subscribe({
      next: (response) => {
        this.products = response.products;
        this.applyFilters();
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to load products';
        this.loading = false;
      }
    });
  }

  applyFilters(): void {
    this.filteredProducts = this.products.filter(p => {
      const matchCat  = this.filterCategory === 'all' || p.category === this.filterCategory;
      const matchStat = this.filterStatus === 'all'
        || (this.filterStatus === 'active' && p.isActive)
        || (this.filterStatus === 'inactive' && !p.isActive);
      const matchSearch = !this.searchTerm ||
        p.name.toLowerCase().includes(this.searchTerm.toLowerCase());
      return matchCat && matchStat && matchSearch;
    });
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  openNewForm(): void {
    this.showForm = true;
    this.editMode = false;
    this.currentProduct = { name: '', category: 'Life Insurance', isActive: true };
  }

  editProduct(product: ProductType): void {
    this.showForm = true;
    this.editMode = true;
    this.currentProduct = { ...product };
  }

  cancelForm(): void {
    this.showForm = false;
    this.editMode = false;
    this.currentProduct = {};
  }

  saveProduct(): void {
    if (!this.currentProduct.name?.trim() || !this.currentProduct.category) {
      this.error = 'Product name and category are required';
      return;
    }

    if (this.editMode && this.currentProduct._id) {
      this.productTypeService.updateProduct(this.currentProduct._id, this.currentProduct).subscribe({
        next: () => {
          this.success = 'Product updated successfully';
          this.cancelForm();
          this.loadProducts();
          setTimeout(() => this.success = '', 3000);
        },
        error: (err) => {
          this.error = err.error?.message || 'Failed to update product';
        }
      });
    } else {
      this.productTypeService.createProduct(this.currentProduct).subscribe({
        next: () => {
          this.success = 'Product created successfully';
          this.cancelForm();
          this.loadProducts();
          setTimeout(() => this.success = '', 3000);
        },
        error: (err) => {
          this.error = err.error?.message || 'Failed to create product';
        }
      });
    }
  }

  toggleActive(product: ProductType): void {
    const action = product.isActive ? 'deactivate' : 're-activate';
    if (!confirm(`Are you sure you want to ${action} "${product.name}"?`)) return;

    const update = product.isActive
      ? this.productTypeService.deactivateProduct(product._id!)
      : this.productTypeService.updateProduct(product._id!, { isActive: true });

    update.subscribe({
      next: () => {
        this.success = `Product ${action}d successfully`;
        this.loadProducts();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => {
        this.error = err.error?.message || `Failed to ${action} product`;
      }
    });
  }

  getCategoryBadgeClass(category: string): string {
    const map: any = {
      'Life Insurance':                   'bg-primary',
      'Health Insurance':                 'bg-success',
      'Medicare':                         'bg-warning text-dark',
      'Supplemental Insurance':           'bg-info text-dark',
      'Retirement / Annuities':           'bg-secondary',
      'Property & Casualty - Personal':   'bg-dark text-white',
      'Property & Casualty - Commercial': 'bg-danger'
    };
    return map[category] || 'bg-secondary';
  }

  deleteProduct(product: ProductType): void {
    if (!confirm(`Are you sure you want to delete "${product.name}"? This will deactivate the product.`)) return;

    this.productTypeService.deactivateProduct(product._id!).subscribe({
      next: () => {
        this.success = 'Product deleted successfully';
        this.loadProducts();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to delete product';
      }
    });
  }

  get activeCount(): number {
    return this.products.filter(p => p.isActive).length;
  }

  get inactiveCount(): number {
    return this.products.filter(p => !p.isActive).length;
  }
}
