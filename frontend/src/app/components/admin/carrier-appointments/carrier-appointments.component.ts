import { Component, OnInit } from '@angular/core';
import { CarrierService, AgentCarrierStatus, Carrier } from '../../../services/carrier.service';

type AppointmentStatus = 'Appointed' | 'Unappointed' | 'Pending';

@Component({
  selector: 'app-carrier-appointments',
  templateUrl: './carrier-appointments.component.html',
  styleUrls: ['./carrier-appointments.component.css']
})
export class CarrierAppointmentsComponent implements OnInit {
  // ---- Manual tracking (agent-centric) ----
  agents: { _id: string; name: string; email: string }[] = [];
  agentSearch = '';
  selectedAgentId = '';
  carriers: Carrier[] = [];
  // carrierId -> current status string for the selected agent
  agentStatusMap: { [carrierId: string]: AgentCarrierStatus } = {};
  manageLoading = false;
  savingStatusId = '';

  // ---- Existing appointment records table ----
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

  readonly STATUS_OPTIONS: AppointmentStatus[] = ['Appointed', 'Pending', 'Unappointed'];

  constructor(private carrierService: CarrierService) {}

  ngOnInit(): void {
    this.loadAgents();
    this.loadCarriers();
    this.loadRequests();
  }

  // -------------------------------------------------------------------------
  // Manual tracking
  // -------------------------------------------------------------------------
  loadAgents(): void {
    this.carrierService.getAgentsForAppointments().subscribe({
      next: (agents) => { this.agents = agents; },
      error: () => { this.error = 'Failed to load agents'; }
    });
  }

  loadCarriers(): void {
    this.carrierService.getAllCarriers(true).subscribe({
      next: (carriers) => { this.carriers = carriers; },
      error: () => { this.error = 'Failed to load carriers'; }
    });
  }

  get filteredAgents(): { _id: string; name: string; email: string }[] {
    const term = this.agentSearch.trim().toLowerCase();
    if (!term) return this.agents;
    return this.agents.filter(a =>
      (a.name && a.name.toLowerCase().includes(term)) ||
      (a.email && a.email.toLowerCase().includes(term))
    );
  }

  get selectedAgent(): { _id: string; name: string; email: string } | undefined {
    return this.agents.find(a => a._id === this.selectedAgentId);
  }

  onAgentSelected(): void {
    this.agentStatusMap = {};
    if (!this.selectedAgentId) return;
    this.manageLoading = true;
    this.carrierService.getAgentStatuses(this.selectedAgentId).subscribe({
      next: (statuses) => {
        const map: { [carrierId: string]: AgentCarrierStatus } = {};
        for (const s of statuses) {
          const carrierId = typeof s.carrier === 'object' ? s.carrier._id : s.carrier;
          if (carrierId) map[carrierId] = s;
        }
        this.agentStatusMap = map;
        this.manageLoading = false;
      },
      error: () => { this.error = 'Failed to load agent statuses'; this.manageLoading = false; }
    });
  }

  currentStatus(carrier: Carrier): string {
    return carrier._id && this.agentStatusMap[carrier._id]
      ? this.agentStatusMap[carrier._id].status
      : 'Not Set';
  }

  statusBadgeClass(status: string): string {
    if (status === 'Appointed') return 'bg-success';
    if (status === 'Unappointed') return 'bg-secondary';
    if (status === 'Pending' || status === 'Requested') return 'bg-warning text-dark';
    return 'bg-light text-muted border';
  }

  setStatus(carrier: Carrier, status: AppointmentStatus): void {
    if (!this.selectedAgentId || !carrier._id) return;
    if (this.currentStatus(carrier) === status) return;
    this.savingStatusId = carrier._id;
    this.error = '';

    this.carrierService.setAgentCarrierStatus(this.selectedAgentId, carrier._id, status).subscribe({
      next: (res) => {
        if (carrier._id) this.agentStatusMap[carrier._id] = res.status;
        this.success = `${this.selectedAgent?.name || 'Agent'} set to "${status}" for ${carrier.name}`;
        this.savingStatusId = '';
        // Keep the records table in sync
        this.loadRequests();
        setTimeout(() => this.success = '', 4000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to update status';
        this.savingStatusId = '';
      }
    });
  }

  // -------------------------------------------------------------------------
  // Existing appointment records
  // -------------------------------------------------------------------------
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
        if (this.selectedAgentId) this.onAgentSelected();
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
        if (this.selectedAgentId) this.onAgentSelected();
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
