import { Component, OnInit } from '@angular/core';
import { CarrierService, Carrier, AgentCarrierStatus } from '../../../services/carrier.service';
import { environment } from '../../../../environments/environment';

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
    this.showDetailsModal = true;
  }

  closeDetails(): void {
    this.showDetailsModal = false;
    this.selectedCarrier = null;
  }

  getGuideUrl(path: string): string {
    return `${environment.apiUrl.replace('/api', '')}/${path}`;
  }

  get currentCarriers(): Carrier[] {
    return this.carriersByCategory[this.activeTab] || [];
  }
}
