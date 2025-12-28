import { Component, OnInit } from '@angular/core';
import { LicensingService, LicensingProgress } from '../../services/licensing.service';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-licensing',
  templateUrl: './licensing.component.html',
  styleUrls: ['./licensing.component.css']
})
export class LicensingComponent implements OnInit {
  licensingProgress: LicensingProgress[] = [];
  selectedAgent: LicensingProgress | null = null;
  loading = true;
  error = '';
  isAdmin = false;
  currentUserId = '';

  // Filters
  filterIsLicensed: string = 'all'; // 'all', 'licensed', 'unlicensed'

  // Checklist item being edited
  editingItem: string | null = null;
  uploadingFile: { [key: string]: boolean } = {};

  constructor(
    private licensingService: LicensingService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    this.isAdmin = user?.role === 'admin';
    this.currentUserId = user?._id || '';
    
    this.loadLicensingProgress();
  }

  loadLicensingProgress(): void {
    this.loading = true;
    this.error = '';

    const filters: any = {};
    if (this.filterIsLicensed === 'licensed') {
      filters.isLicensed = true;
    } else if (this.filterIsLicensed === 'unlicensed') {
      filters.isLicensed = false;
    }

    this.licensingService.getAllLicensingProgress(filters).subscribe({
      next: (data) => {
        this.licensingProgress = data;
        // If agent viewing own, auto-select
        if (!this.isAdmin && data.length > 0) {
          this.selectedAgent = data[0];
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading licensing progress:', error);
        this.error = 'Failed to load licensing progress';
        this.loading = false;
      }
    });
  }

  selectAgent(progress: LicensingProgress): void {
    this.selectedAgent = progress;
    this.editingItem = null;
  }

  getDaysRemainingColor(days: number): string {
    if (days <= 10) return 'text-danger';
    if (days <= 20) return 'text-warning';
    return 'text-success';
  }

  updateChecklistItem(item: string, field: string, value: any): void {
    if (!this.selectedAgent || !this.isAdmin) return;

    const data: any = {};
    data[field] = value;

    this.licensingService.updateChecklistItem(
      this.selectedAgent.agent._id,
      item,
      data
    ).subscribe({
      next: (updated) => {
        this.selectedAgent = updated;
        // Update in list
        const index = this.licensingProgress.findIndex(
          p => p.agent._id === updated.agent._id
        );
        if (index !== -1) {
          this.licensingProgress[index] = updated;
        }
      },
      error: (error) => {
        console.error('Error updating checklist:', error);
        alert('Failed to update checklist item');
      }
    });
  }

  onFileSelected(event: any, item: string): void {
    const file = event.target.files?.[0];
    if (!file || !this.selectedAgent) return;

    this.uploadingFile[item] = true;

    this.licensingService.uploadDocument(
      this.selectedAgent.agent._id,
      item,
      file
    ).subscribe({
      next: (response) => {
        this.selectedAgent = response.licensingProgress;
        // Update in list
        const index = this.licensingProgress.findIndex(
          p => p.agent._id === response.licensingProgress.agent._id
        );
        if (index !== -1) {
          this.licensingProgress[index] = response.licensingProgress;
        }
        this.uploadingFile[item] = false;
        alert('Document uploaded successfully');
      },
      error: (error) => {
        console.error('Error uploading document:', error);
        alert('Failed to upload document');
        this.uploadingFile[item] = false;
      }
    });
  }

  updateAdminNotes(): void {
    if (!this.selectedAgent || !this.isAdmin) return;

    const notes = prompt('Enter admin notes:', this.selectedAgent.adminNotes || '');
    if (notes === null) return;

    this.licensingService.updateAdminNotes(
      this.selectedAgent.agent._id,
      notes
    ).subscribe({
      next: (updated) => {
        this.selectedAgent = updated;
        // Update in list
        const index = this.licensingProgress.findIndex(
          p => p.agent._id === updated.agent._id
        );
        if (index !== -1) {
          this.licensingProgress[index] = updated;
        }
      },
      error: (error) => {
        console.error('Error updating notes:', error);
        alert('Failed to update notes');
      }
    });
  }

  formatDate(date: any): string {
    if (!date) return 'Not set';
    return new Date(date).toLocaleDateString();
  }

  getChecklistItemStatus(item: any): string {
    if (item.completed || item.scheduled || item.submitted || item.approved) {
      return 'Completed';
    }
    return 'Pending';
  }

  getChecklistItemClass(item: any): string {
    if (item.completed || item.scheduled || item.submitted || item.approved) {
      return 'list-group-item-success';
    }
    return '';
  }
}
