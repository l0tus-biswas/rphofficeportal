import { Component, OnInit } from '@angular/core';
import { BroadcastService, Broadcast } from '../../../services/broadcast.service';

@Component({
  selector: 'app-broadcast-management',
  templateUrl: './broadcast-management.component.html',
  styleUrls: ['./broadcast-management.component.css']
})
export class BroadcastManagementComponent implements OnInit {
  broadcasts: Broadcast[] = [];
  loading = false;
  page = 1;
  totalPages = 1;
  total = 0;

  // Form state
  showModal = false;
  editMode = false;
  saving = false;
  selectedBroadcast: Broadcast | null = null;

  formTitle = '';
  formMessage = '';
  formLink = '';
  formRoles: string[] = [];

  success = '';
  error = '';

  constructor(private broadcastService: BroadcastService) {}

  ngOnInit(): void {
    this.loadBroadcasts();
  }

  loadBroadcasts(): void {
    this.loading = true;
    this.broadcastService.getAdminBroadcasts(this.page).subscribe({
      next: (res: any) => {
        this.broadcasts = res?.broadcasts || res?.data?.broadcasts || [];
        const pagination = res?.pagination || res?.data?.pagination;
        this.totalPages = pagination?.pages || 1;
        this.total = pagination?.total || 0;
        this.loading = false;
      },
      error: () => {
        this.broadcasts = [];
        this.loading = false;
      }
    });
  }

  // === Modal Management ===

  openCreateModal(): void {
    this.editMode = false;
    this.selectedBroadcast = null;
    this.formTitle = '';
    this.formMessage = '';
    this.formLink = '';
    this.formRoles = [];
    this.error = '';
    this.showModal = true;
  }

  openEditModal(broadcast: Broadcast): void {
    this.editMode = true;
    this.selectedBroadcast = broadcast;
    this.formTitle = broadcast.title;
    this.formMessage = broadcast.message;
    this.formLink = broadcast.link || '';
    this.formRoles = [...(broadcast.targetRoles || [])];
    this.error = '';
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.selectedBroadcast = null;
  }

  toggleRole(role: string): void {
    const idx = this.formRoles.indexOf(role);
    if (idx >= 0) this.formRoles.splice(idx, 1);
    else this.formRoles.push(role);
  }

  hasRole(role: string): boolean {
    return this.formRoles.includes(role);
  }

  // === CRUD Operations ===

  saveBroadcast(): void {
    if (!this.formTitle.trim() || !this.formMessage.trim()) {
      this.error = 'Title and message are required.';
      return;
    }
    this.saving = true;
    this.error = '';

    const data: any = {
      title: this.formTitle.trim(),
      message: this.formMessage.trim(),
      link: this.formLink.trim() || null,
      targetRoles: this.formRoles.length > 0 ? this.formRoles : []
    };

    if (this.editMode && this.selectedBroadcast) {
      this.broadcastService.updateBroadcast(this.selectedBroadcast._id, data).subscribe({
        next: () => {
          this.success = 'Broadcast updated.';
          this.saving = false;
          this.closeModal();
          this.loadBroadcasts();
          setTimeout(() => this.success = '', 3000);
        },
        error: (err: any) => {
          this.error = err.error?.message || 'Failed to update broadcast.';
          this.saving = false;
        }
      });
    } else {
      this.broadcastService.createBroadcast(data).subscribe({
        next: (res: any) => {
          this.success = res?.message || res?.data?.message || 'Broadcast sent!';
          this.saving = false;
          this.closeModal();
          this.loadBroadcasts();
          setTimeout(() => this.success = '', 5000);
        },
        error: (err: any) => {
          this.error = err.error?.message || 'Failed to send broadcast.';
          this.saving = false;
        }
      });
    }
  }

  deleteBroadcast(broadcast: Broadcast): void {
    if (!confirm(`Delete broadcast "${broadcast.title}"? This will also remove all related notifications.`)) return;
    this.broadcastService.deleteBroadcast(broadcast._id).subscribe({
      next: () => {
        this.success = 'Broadcast deleted.';
        this.loadBroadcasts();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to delete broadcast.';
      }
    });
  }

  toggleActive(broadcast: Broadcast): void {
    this.broadcastService.updateBroadcast(broadcast._id, { isActive: !broadcast.isActive }).subscribe({
      next: () => {
        broadcast.isActive = !broadcast.isActive;
        this.success = broadcast.isActive ? 'Broadcast activated.' : 'Broadcast deactivated.';
        setTimeout(() => this.success = '', 3000);
      }
    });
  }

  resend(broadcast: Broadcast): void {
    if (!confirm('Resend this broadcast to users who haven\'t received it yet?')) return;
    this.broadcastService.resendBroadcast(broadcast._id).subscribe({
      next: (res: any) => {
        this.success = res?.message || res?.data?.message || 'Resent!';
        this.loadBroadcasts();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to resend.';
      }
    });
  }

  getRoleLabel(roles: string[]): string {
    if (!roles || roles.length === 0) return 'All Users';
    return roles.map(r => r.charAt(0).toUpperCase() + r.slice(1) + 's').join(', ');
  }

  prevPage(): void {
    if (this.page > 1) { this.page--; this.loadBroadcasts(); }
  }

  nextPage(): void {
    if (this.page < this.totalPages) { this.page++; this.loadBroadcasts(); }
  }
}
