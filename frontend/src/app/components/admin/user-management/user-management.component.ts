import { Component, OnInit } from '@angular/core';
import { AdminService } from '../../../services/admin.service';

@Component({
  selector: 'app-user-management',
  templateUrl: './user-management.component.html',
  styleUrls: ['./user-management.component.css']
})
export class UserManagementComponent implements OnInit {
  users: any[] = [];
  filteredUsers: any[] = [];
  loading = false;
  error = '';
  success = '';
  Math = Math;
  
  // Pagination
  currentPage = 1;
  itemsPerPage = 10;
  totalUsers = 0;
  
  // Filters
  searchTerm = '';
  roleFilter = 'all';
  statusFilter = 'all';
  
  // Modal
  selectedUser: any = null;
  showEditModal = false;
  editForm: any = {};

  constructor(private adminService: AdminService) { }

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.loading = true;
    this.error = '';
    
    this.adminService.getUsers().subscribe({
      next: (response: any) => {
        this.users = response.users;
        this.filteredUsers = [...this.users];
        this.totalUsers = response.pagination?.total || this.users.length;
        this.loading = false;
        this.applyFilters();
      },
      error: (error: any) => {
        this.error = error.error?.message || 'Failed to load users';
        this.loading = false;
      }
    });
  }

  applyFilters(): void {
    this.filteredUsers = this.users.filter(user => {
      const matchesSearch = !this.searchTerm || 
        user.name?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        user.referralCode?.toLowerCase().includes(this.searchTerm.toLowerCase());
      
      const matchesRole = this.roleFilter === 'all' || user.role === this.roleFilter;
      const matchesStatus = this.statusFilter === 'all' || 
        (this.statusFilter === 'active' && user.isActive) ||
        (this.statusFilter === 'inactive' && !user.isActive);
      
      return matchesSearch && matchesRole && matchesStatus;
    });
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  openEditModal(user: any): void {
    this.selectedUser = user;
    this.editForm = { ...user };
    this.showEditModal = true;
  }

  closeEditModal(): void {
    this.showEditModal = false;
    this.selectedUser = null;
    this.editForm = {};
  }

  saveUser(): void {
    if (!this.selectedUser) return;
    
    this.loading = true;
    this.adminService.updateUser(this.selectedUser._id, this.editForm).subscribe({
      next: (response) => {
        this.success = 'User updated successfully!';
        this.loadUsers();
        this.closeEditModal();
        setTimeout(() => this.success = '', 3000);
      },
      error: (error) => {
        this.error = error.error?.message || 'Failed to update user';
        this.loading = false;
      }
    });
  }

  toggleUserStatus(user: any): void {
    const action = user.isActive ? 'deactivate' : 'activate';
    if (!confirm(`Are you sure you want to ${action} ${user.name}?`)) return;
    
    this.loading = true;
    this.adminService.updateUser(user._id, { isActive: !user.isActive }).subscribe({
      next: (response) => {
        this.success = `User ${action}d successfully!`;
        this.loadUsers();
        setTimeout(() => this.success = '', 3000);
      },
      error: (error) => {
        this.error = error.error?.message || `Failed to ${action} user`;
        this.loading = false;
      }
    });
  }

  deleteUser(user: any): void {
    if (!confirm(`Are you sure you want to permanently delete ${user.name}? This action cannot be undone.`)) return;
    
    this.loading = true;
    this.error = '';
    this.success = '';
    
    this.adminService.deleteUser(user._id).subscribe({
      next: (response) => {
        this.success = 'User deleted successfully!';
        // Remove user from local array immediately
        this.users = this.users.filter(u => u._id !== user._id);
        this.applyFilters();
        this.loading = false;
        setTimeout(() => this.success = '', 3000);
      },
      error: (error) => {
        this.error = error.error?.message || 'Failed to delete user';
        this.loading = false;
      }
    });
  }

  get totalPages(): number {
    return Math.ceil(this.filteredUsers.length / this.itemsPerPage);
  }

  get paginatedUsers(): any[] {
    const start = (this.currentPage - 1) * this.itemsPerPage;
    return this.filteredUsers.slice(start, start + this.itemsPerPage);
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
    }
  }

  getRoleBadgeClass(role: string): string {
    const classes: any = {
      'admin': 'bg-danger',
      'agent': 'bg-primary',
      'recruit': 'bg-secondary'
    };
    return classes[role] || 'bg-secondary';
  }
}
