import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CouponService } from '../../../services/coupon.service';

declare var bootstrap: any;

@Component({
  selector: 'app-coupon-management',
  templateUrl: './coupon-management.component.html',
  styleUrls: ['./coupon-management.component.css']
})
export class CouponManagementComponent implements OnInit {
  coupons: any[] = [];
  couponForm: FormGroup;
  loading: boolean = false;
  error: string = '';
  success: string = '';
  
  // Filters and pagination
  statusFilter: string = 'all';
  searchTerm: string = '';
  sortBy: string = 'createdAt:desc';
  currentPage: number = 1;
  pageSize: number = 10;
  totalPages: number = 1;
  
  // Modal state
  isEditMode: boolean = false;
  currentCouponId: string = '';
  createModal: any;
  deleteModal: any;
  couponToDelete: any = null;

  // Role checkboxes state
  selectedRoles = {
    admin: false,
    agent: false
  };

  constructor(
    private fb: FormBuilder,
    private couponService: CouponService
  ) {
    this.couponForm = this.fb.group({
      code: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(20)]],
      description: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(500)]],
      discountType: ['percentage', Validators.required],
      discountValue: [0, [Validators.required, Validators.min(0)]],
      minPurchaseAmount: [0, [Validators.min(0)]],
      maxDiscountAmount: [null, [Validators.min(0)]],
      validFrom: ['', Validators.required],
      validUntil: ['', Validators.required],
      usageLimit: [null, [Validators.min(0)]],
      userUsageLimit: [1, [Validators.min(1)]],
      applicableRoles: [[]],
      isActive: [true]
    });
  }

  ngOnInit(): void {
    this.loadCoupons();
    
    // Initialize modals after view init
    setTimeout(() => {
      const createModalEl = document.getElementById('createCouponModal');
      const deleteModalEl = document.getElementById('deleteCouponModal');
      
      if (createModalEl) this.createModal = new bootstrap.Modal(createModalEl);
      if (deleteModalEl) this.deleteModal = new bootstrap.Modal(deleteModalEl);
    }, 100);
  }

  loadCoupons(): void {
    this.loading = true;
    this.error = '';

    const params: any = {
      page: this.currentPage,
      limit: this.pageSize
    };

    if (this.statusFilter !== 'all') {
      params.status = this.statusFilter;
    }

    if (this.searchTerm) {
      params.search = this.searchTerm;
    }

    if (this.sortBy) {
      params.sortBy = this.sortBy;
    }

    this.couponService.getCoupons(params).subscribe({
      next: (response) => {
        this.coupons = response.coupons;
        this.totalPages = response.pagination.pages;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading coupons:', error);
        this.error = error.error?.message || 'Failed to load coupons';
        this.loading = false;
      }
    });
  }

  openCreateModal(): void {
    this.isEditMode = false;
    this.couponForm.reset({
      discountType: 'percentage',
      discountValue: 0,
      minPurchaseAmount: 0,
      maxDiscountAmount: null,
      usageLimit: null,
      userUsageLimit: 1,
      applicableRoles: [],
      isActive: true
    });
    this.selectedRoles = { admin: false, agent: false };
    this.createModal?.show();
  }

  openEditModal(coupon: any): void {
    this.isEditMode = true;
    this.currentCouponId = coupon._id;
    
    // Format dates for input fields
    const validFrom = new Date(coupon.validFrom).toISOString().slice(0, 16);
    const validUntil = new Date(coupon.validUntil).toISOString().slice(0, 16);
    
    this.couponForm.patchValue({
      ...coupon,
      validFrom,
      validUntil
    });

    // Set role checkboxes
    const roles = coupon.applicableRoles || [];
    this.selectedRoles = {
      admin: roles.includes('admin'),
      agent: roles.includes('agent')
    };
    
    this.createModal?.show();
  }

  onRoleChange(role: string, checked: boolean): void {
    const roles = this.couponForm.get('applicableRoles')?.value || [];
    if (checked) {
      if (!roles.includes(role)) {
        roles.push(role);
      }
    } else {
      const index = roles.indexOf(role);
      if (index > -1) {
        roles.splice(index, 1);
      }
    }
    this.couponForm.patchValue({ applicableRoles: roles });
  }

  saveCoupon(): void {
    if (this.couponForm.invalid) {
      Object.keys(this.couponForm.controls).forEach(key => {
        this.couponForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    const formData = this.couponForm.value;

    const request = this.isEditMode
      ? this.couponService.updateCoupon(this.currentCouponId, formData)
      : this.couponService.createCoupon(formData);

    request.subscribe({
      next: (response) => {
        this.success = response.message;
        this.loading = false;
        this.createModal?.hide();
        this.loadCoupons();
        setTimeout(() => this.success = '', 3000);
      },
      error: (error) => {
        console.error('Error saving coupon:', error);
        this.error = error.error?.message || 'Failed to save coupon';
        this.loading = false;
      }
    });
  }

  openDeleteModal(coupon: any): void {
    this.couponToDelete = coupon;
    this.deleteModal?.show();
  }

  confirmDelete(): void {
    if (!this.couponToDelete) return;

    this.loading = true;
    this.error = '';
    this.success = '';

    this.couponService.deleteCoupon(this.couponToDelete._id).subscribe({
      next: (response) => {
        this.success = response.message;
        this.loading = false;
        this.deleteModal?.hide();
        this.couponToDelete = null;
        this.loadCoupons();
        setTimeout(() => this.success = '', 3000);
      },
      error: (error) => {
        console.error('Error deleting coupon:', error);
        this.error = error.error?.message || 'Failed to delete coupon';
        this.loading = false;
      }
    });
  }

  toggleCouponStatus(coupon: any): void {
    this.couponService.toggleCouponStatus(coupon._id).subscribe({
      next: (response) => {
        this.success = response.message;
        this.loadCoupons();
        setTimeout(() => this.success = '', 3000);
      },
      error: (error) => {
        console.error('Error toggling coupon status:', error);
        this.error = error.error?.message || 'Failed to toggle coupon status';
      }
    });
  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.loadCoupons();
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.loadCoupons();
    }
  }

  onSortChange(sortBy: string): void {
    this.sortBy = sortBy;
    this.loadCoupons();
  }

  getDiscountDisplay(coupon: any): string {
    if (coupon.discountType === 'percentage') {
      return `${coupon.discountValue}%`;
    }
    return `$${coupon.discountValue}`;
  }

  getStatusBadgeClass(coupon: any): string {
    if (!coupon.isActive) return 'bg-secondary';
    if (coupon.isExpired) return 'bg-danger';
    if (coupon.isUsageLimitReached) return 'bg-warning';
    if (coupon.isValid) return 'bg-success';
    return 'bg-secondary';
  }

  getStatusText(coupon: any): string {
    if (!coupon.isActive) return 'Inactive';
    if (coupon.isExpired) return 'Expired';
    if (coupon.isUsageLimitReached) return 'Limit Reached';
    if (coupon.isValid) return 'Active';
    return 'Inactive';
  }

  getRolesDisplay(roles: string[]): string {
    if (!roles || roles.length === 0) return 'All Roles';
    return roles.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(', ');
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.couponForm.get(fieldName);
    return !!(field && field.invalid && field.touched);
  }
}
