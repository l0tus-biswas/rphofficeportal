import { Component, OnInit } from '@angular/core';
import { CarrierService, AgentCarrierStatus } from '../../../services/carrier.service';

@Component({
  selector: 'app-carrier-appointments',
  templateUrl: './carrier-appointments.component.html',
  styleUrls: ['./carrier-appointments.component.css']
})
export class CarrierAppointmentsComponent implements OnInit {
  requests: AgentCarrierStatus[] = [];
  filteredRequests: AgentCarrierStatus[] = [];
  filterStatus = '';
  loading = true;
  error = '';
  success = '';
  appointingId = '';
  unappointingId = '';

  // Notes modal
  showNotesModal = false;
  selectedRequest: AgentCarrierStatus | null = null;
  newNoteText = '';
  addingNote = false;

  constructor(private carrierService: CarrierService) {}

  ngOnInit(): void {
    this.loadRequests();
  }

  loadRequests(): void {
    this.loading = true;
    this.carrierService.getAllCarrierRequests().subscribe({
      next: (requests) => {
        this.requests = requests;
        this.applyFilter();
        this.loading = false;
      },
      error: () => {
        this.error = 'Failed to load carrier requests';
        this.loading = false;
      }
    });
  }

  applyFilter(): void {
    this.filteredRequests = this.filterStatus
      ? this.requests.filter(r => r.status === this.filterStatus)
      : [...this.requests];
  }

  appoint(request: AgentCarrierStatus): void {
    if (!request._id) return;
    this.appointingId = request._id;
    this.error = '';

    this.carrierService.appointCarrier(request._id).subscribe({
      next: () => {
        this.success = `Agent appointed for ${(request.carrier as any)?.name || 'carrier'}`;
        this.appointingId = '';
        this.loadRequests();
        setTimeout(() => this.success = '', 4000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to appoint agent';
        this.appointingId = '';
      }
    });
  }

  unappoint(request: AgentCarrierStatus): void {
    if (!request._id) return;
    if (!confirm(`Unappoint ${(request.agent as any)?.name} from ${(request.carrier as any)?.name}?`)) return;
    this.unappointingId = request._id;
    this.error = '';

    this.carrierService.unappointCarrier(request._id).subscribe({
      next: () => {
        this.success = `Agent unappointed from ${(request.carrier as any)?.name || 'carrier'}`;
        this.unappointingId = '';
        this.loadRequests();
        setTimeout(() => this.success = '', 4000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to unappoint agent';
        this.unappointingId = '';
      }
    });
  }

  openNotes(request: AgentCarrierStatus): void {
    this.selectedRequest = request;
    this.newNoteText = '';
    this.showNotesModal = true;
  }

  closeNotesModal(): void {
    this.showNotesModal = false;
    this.selectedRequest = null;
    this.newNoteText = '';
  }

  addNote(): void {
    if (!this.selectedRequest?._id || !this.newNoteText.trim()) return;
    this.addingNote = true;

    this.carrierService.addNote(this.selectedRequest._id, this.newNoteText.trim()).subscribe({
      next: (res) => {
        this.selectedRequest = res.status;
        // Also update in the main list
        const idx = this.requests.findIndex(r => r._id === res.status._id);
        if (idx !== -1) this.requests[idx] = res.status;
        this.applyFilter();
        this.newNoteText = '';
        this.addingNote = false;
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to add note';
        this.addingNote = false;
      }
    });
  }
}
