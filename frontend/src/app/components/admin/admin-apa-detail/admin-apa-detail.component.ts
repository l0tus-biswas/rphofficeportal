import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApaService } from '../../../services/apa.service';

@Component({
  selector: 'app-admin-apa-detail',
  templateUrl: './admin-apa-detail.component.html',
  styleUrls: ['./admin-apa-detail.component.css']
})
export class AdminApaDetailComponent implements OnInit {
  application: any = null;
  loading = false;
  error = '';
  successMessage = '';
  
  showRejectModal = false;
  rejectionReason = '';
  adminNotes = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private apaService: ApaService
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.params['id'];
    if (id) {
      this.loadApplication(id);
    }
  }

  loadApplication(id: string): void {
    this.loading = true;
    this.error = '';
    
    this.apaService.getApplication(id).subscribe({
      next: (response) => {
        this.loading = false;
        this.application = response.application;
        this.adminNotes = this.application.adminNotes || '';
      },
      error: (error) => {
        this.loading = false;
        this.error = error.error?.message || 'Failed to load application';
      }
    });
  }

  approveApplication(): void {
    if (!confirm('Are you sure you want to approve this application?')) {
      return;
    }
    
    this.loading = true;
    this.apaService.approveApplication(this.application._id, this.adminNotes).subscribe({
      next: () => {
        this.loading = false;
        this.successMessage = 'Application approved successfully';
        this.loadApplication(this.application._id);
      },
      error: (error) => {
        this.loading = false;
        this.error = error.error?.message || 'Failed to approve application';
      }
    });
  }

  openRejectModal(): void {
    this.showRejectModal = true;
    this.rejectionReason = '';
  }

  closeRejectModal(): void {
    this.showRejectModal = false;
  }

  confirmReject(): void {
    if (!this.rejectionReason.trim()) {
      alert('Please provide a rejection reason');
      return;
    }
    
    this.loading = true;
    this.apaService.rejectApplication(this.application._id, this.rejectionReason, this.adminNotes).subscribe({
      next: () => {
        this.loading = false;
        this.closeRejectModal();
        this.successMessage = 'Application rejected';
        this.loadApplication(this.application._id);
      },
      error: (error) => {
        this.loading = false;
        this.error = error.error?.message || 'Failed to reject application';
      }
    });
  }

  saveNotes(): void {
    this.apaService.updateNotes(this.application._id, this.adminNotes).subscribe({
      next: () => {
        this.successMessage = 'Notes saved successfully';
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (error) => {
        this.error = error.error?.message || 'Failed to save notes';
      }
    });
  }

  getStatusBadgeClass(status: string): string {
    const classes: any = {
      'pending_signature': 'bg-warning',
      'pending_payment': 'bg-info',
      'active': 'bg-success',
      'rejected': 'bg-danger'
    };
    return classes[status] || 'bg-secondary';
  }

  goBack(): void {
    this.router.navigate(['/admin/apa-applications']);
  }
}
