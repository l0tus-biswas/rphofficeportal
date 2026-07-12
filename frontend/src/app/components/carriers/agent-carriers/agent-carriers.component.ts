import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { CarrierService, Carrier, CarrierDocument, AgentCarrierStatus } from '../../../services/carrier.service';

@Component({
  selector: 'app-agent-carriers',
  templateUrl: './agent-carriers.component.html',
  styleUrls: ['./agent-carriers.component.css']
})
export class AgentCarriersComponent implements OnInit {
  activeTab = 'Life Insurance';

  readonly TABS: { label: string; category: string; icon: string }[] = [
    { label: 'Life Insurance', category: 'Life Insurance', icon: 'bi-heart-pulse-fill' },
    { label: 'Supplemental', category: 'Supplemental Insurance', icon: 'bi-shield-fill-plus' },
    { label: 'Health / ACA', category: 'Health Insurance', icon: 'bi-hospital-fill' },
    { label: 'Medicare', category: 'Medicare', icon: 'bi-bandaid-fill' }
  ];

  // Per-category carrier lists
  carriersByCategory: { [key: string]: Carrier[] } = {};
  // Agent's status map: carrierId -> AgentCarrierStatus
  myStatuses: { [carrierId: string]: AgentCarrierStatus } = {};

  loading = true;
  error = '';

  // Details modal
  showDetailsModal = false;
  selectedCarrier: Carrier | null = null;

  // Request-contract state
  requesting = false;
  requestSuccess = '';

  constructor(private carrierService: CarrierService) {}

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    // Load all active carriers + my statuses in parallel
    let carriersLoaded = false;
    let statusesLoaded = false;

    const checkDone = () => {
      if (carriersLoaded && statusesLoaded) this.loading = false;
    };

    this.carrierService.getAllCarriers(true).subscribe({
      next: (carriers) => {
        this.carriersByCategory = {};
        for (const tab of this.TABS) {
          this.carriersByCategory[tab.category] = carriers.filter(c =>
            c.category && c.category.includes(tab.category)
          );
        }
        carriersLoaded = true;
        checkDone();
      },
      error: () => { this.error = 'Failed to load carriers'; carriersLoaded = true; checkDone(); }
    });

    this.carrierService.getMyCarrierStatuses().subscribe({
      next: (statuses) => {
        this.myStatuses = {};
        for (const s of statuses) {
          const carrierId = typeof s.carrier === 'object' ? s.carrier._id : s.carrier;
          this.myStatuses[carrierId] = s;
        }
        statusesLoaded = true;
        checkDone();
      },
      error: () => { statusesLoaded = true; checkDone(); }
    });
  }

  getStatus(carrier: Carrier): AgentCarrierStatus | null {
    return carrier._id ? (this.myStatuses[carrier._id] || null) : null;
  }

  // Map raw status to a friendly label for the agent view
  statusLabel(status?: string): string {
    if (status === 'Appointed') return 'Appointed';
    if (status === 'Unappointed') return 'Unappointed';
    if (status === 'Pending' || status === 'Requested') return 'Pending / In Progress';
    return 'Not Set';
  }

  statusBadgeClass(status?: string): string {
    if (status === 'Appointed') return 'bg-success';
    if (status === 'Unappointed') return 'bg-secondary';
    if (status === 'Pending' || status === 'Requested') return 'bg-warning text-dark';
    return 'bg-light text-muted border';
  }

  openDetails(carrier: Carrier): void {
    this.selectedCarrier = carrier;
    this.requestSuccess = '';
    this.error = '';
    this.showDetailsModal = true;
  }

  closeDetails(): void {
    this.showDetailsModal = false;
    this.selectedCarrier = null;
    this.requestSuccess = '';
  }

  // An agent can request a contract only when there is no existing status record
  canRequestContract(carrier: Carrier): boolean {
    return !this.getStatus(carrier);
  }

  requestContract(carrier: Carrier): void {
    if (!carrier._id || this.requesting) return;
    this.requesting = true;
    this.error = '';
    this.requestSuccess = '';
    this.carrierService.requestContract(carrier._id).subscribe({
      next: (res) => {
        this.requesting = false;
        this.requestSuccess = 'Contract request submitted. Your admin has been notified.';
        // Reflect the new status locally so the button hides immediately
        if (carrier._id && res.status) {
          this.myStatuses[carrier._id] = res.status;
        }
      },
      error: (err) => {
        this.requesting = false;
        this.error = err?.error?.message || 'Failed to submit contract request';
      }
    });
  }

  viewLevelGuide(carrier: Carrier): void {
    if (!carrier._id) return;
    this.openPdfBlob(this.carrierService.downloadLevelGuide(carrier._id));
  }

  viewDocument(carrier: Carrier, doc: CarrierDocument): void {
    if (!carrier._id || !doc._id) return;
    this.openPdfBlob(this.carrierService.downloadCarrierDocument(carrier._id, doc._id));
  }

  private openPdfBlob(source: Observable<Blob>): void {
    const win = window.open('', '_blank');
    source.subscribe({
      next: (blob) => {
        const typed = new Blob([blob], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(typed);
        if (win && !win.closed) {
          win.location.href = url;
        }
        setTimeout(() => window.URL.revokeObjectURL(url), 60000);
      },
      error: () => { if (win && !win.closed) win.close(); this.error = 'Failed to open document'; }
    });
  }

  get currentCarriers(): Carrier[] {
    return this.carriersByCategory[this.activeTab] || [];
  }
}
