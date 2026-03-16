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
}
