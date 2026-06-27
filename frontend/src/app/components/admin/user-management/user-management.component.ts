import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AdminService } from '../../../services/admin.service';
import { AuthService } from '../../../services/auth.service';
import { environment } from '../../../../environments/environment';

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
  
  // Edit Modal
  selectedUser: any = null;
  showEditModal = false;
  editForm: any = {};

  // Transfer Modal
  showTransferModal = false;
  transferUser: any = null;
  transferNewUplineId = '';
  transferSearchTerm = '';
  transferring = false;
  eligibleUplines: any[] = [];
  filteredUplines: any[] = [];

  // Impersonation
  impersonating = false;

  constructor(
    private adminService: AdminService,
    private authService: AuthService,
    private http: HttpClient,
    private router: Router
  ) { }

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
    const trimmedSearch = this.searchTerm?.trim() || '';
    this.filteredUsers = this.users.filter(user => {
      const matchesSearch = !trimmedSearch || 
        user.name?.toLowerCase().includes(trimmedSearch.toLowerCase()) ||
        user.email?.toLowerCase().includes(trimmedSearch.toLowerCase()) ||
        user.referralCode?.toLowerCase().includes(trimmedSearch.toLowerCase());
      
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

    // Handle billing exempt change separately via dedicated endpoint
    const billingChanged = this.editForm.billingExempt !== this.selectedUser.billingExempt;
    
    const saveMain = () => {
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
    };

    if (billingChanged) {
      this.adminService.setBillingExempt(
        this.selectedUser._id,
        this.editForm.billingExempt,
        this.editForm.billingExemptReason || ''
      ).subscribe({
        next: () => saveMain(),
        error: (error) => {
          this.error = error.error?.message || 'Failed to update billing status';
          this.loading = false;
        }
      });
    } else {
      saveMain();
    }
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

  toggleBillingExempt(user: any): void {
    const newStatus = !user.billingExempt;
    const action = newStatus ? 'grant Free Access to' : 'remove Free Access from';
    if (!confirm(`Are you sure you want to ${action} ${user.name}?\n\nFree Access users retain full platform access without setup fees or monthly charges.`)) return;

    this.adminService.setBillingExempt(user._id, newStatus, '').subscribe({
      next: () => {
        this.success = newStatus
          ? `${user.name} now has Free Access (no billing)`
          : `${user.name} billing restored to normal`;
        this.loadUsers();
        setTimeout(() => this.success = '', 3000);
      },
      error: (error) => {
        this.error = error.error?.message || 'Failed to update billing status';
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

  loginAsUser(user: any): void {
    if (!confirm(`Log in as ${user.name} (${user.email})?\n\nYou will see the platform exactly as this user does. Use "Exit impersonation" to return to your admin account.`)) return;

    this.impersonating = true;
    this.error = '';
    this.authService.impersonate(user._id).subscribe({
      next: () => {
        this.impersonating = false;
        // Navigate to the impersonated user's dashboard and reload so all
        // services pick up the new session/user context.
        this.router.navigate(['/dashboard']).then(() => window.location.reload());
      },
      error: (error) => {
        this.error = error.error?.message || 'Failed to log in as user';
        this.impersonating = false;
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

  promoteAgent(user: any): void {
    const levels = [
      'associate',
      'senior associate',
      'manager',
      'senior manager',
      'regional executive',
      'senior regional executive',
      'national executive',
      'senior national executive'
    ];
    
    const currentLevel = user.level || 'associate';
    const levelOptions = levels.map(level => {
      const selected = level === currentLevel ? 'selected' : '';
      return `<option value="${level}" ${selected}>${this.getLevelDisplay(level)}</option>`;
    }).join('');
    
    const selectHtml = `
      <select id="levelSelect" class="form-select">
        ${levelOptions}
      </select>
    `;
    
    const modal = document.createElement('div');
    modal.innerHTML = `
      <div class="modal fade show" style="display: block; background: rgba(0,0,0,0.5);">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Promote/Demote ${user.name}</h5>
              <button type="button" class="btn-close" onclick="this.closest('.modal').remove()"></button>
            </div>
            <div class="modal-body">
              <label class="form-label">Select Level:</label>
              ${selectHtml}
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
              <button type="button" class="btn btn-primary" id="confirmPromote">Update Level</button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('#confirmPromote')?.addEventListener('click', () => {
      const select = modal.querySelector('#levelSelect') as HTMLSelectElement;
      const newLevel = select.value;
      
      if (newLevel === currentLevel) {
        modal.remove();
        return;
      }
      
      this.loading = true;
      this.adminService.promoteAgent(user._id, newLevel).subscribe({
        next: (response) => {
          this.success = response.message || 'Agent level updated successfully!';
          this.loadUsers();
          this.loading = false;
          modal.remove();
          setTimeout(() => this.success = '', 3000);
        },
        error: (error) => {
          this.error = error.error?.message || 'Failed to update agent level';
          this.loading = false;
          modal.remove();
        }
      });
    });
  }

  openTransferModal(user: any): void {
    this.transferUser = user;
    this.transferNewUplineId = '';
    this.transferSearchTerm = '';
    // Allow any active user (agent or admin) except the agent being transferred as the new upline
    this.eligibleUplines = this.users.filter(u => u._id !== user._id && u.isActive);
    this.filteredUplines = [...this.eligibleUplines];
    this.showTransferModal = true;
  }

  closeTransferModal(): void {
    this.showTransferModal = false;
    this.transferUser = null;
    this.transferNewUplineId = '';
  }

  filterUplines(): void {
    const term = this.transferSearchTerm.toLowerCase();
    this.filteredUplines = this.eligibleUplines.filter(u =>
      !term || u.name?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term)
    );
  }

  confirmTransfer(): void {
    if (!this.transferUser || !this.transferNewUplineId) return;
    const newUpline = this.users.find(u => u._id === this.transferNewUplineId);
    if (!confirm(`Transfer ${this.transferUser.name} to upline ${newUpline?.name}?`)) return;

    this.transferring = true;
    this.http.put(`${environment.apiUrl}/admin/users/${this.transferUser._id}/transfer`, { newUplineId: this.transferNewUplineId }).subscribe({
      next: () => {
        this.success = `${this.transferUser.name} successfully transferred to ${newUpline?.name}`;
        this.closeTransferModal();
        this.loadUsers();
        this.transferring = false;
        setTimeout(() => this.success = '', 4000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to transfer agent';
        this.transferring = false;
      }
    });
  }

  getLevelDisplay(level: string | undefined): string {
    if (!level) return 'Associate';
    return level.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }
}
