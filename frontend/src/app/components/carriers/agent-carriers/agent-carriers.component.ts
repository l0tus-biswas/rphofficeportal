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
  statusLoading: { [carrierId: string]: boolean } = {};
  error = '';
  success = '';

  // Expanded carrier cards (for whatToExpect / productFactors)
  expandedCards = new Set<string>();

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

  requestContract(carrier: Carrier): void {
    if (!carrier._id) return;
    this.statusLoading[carrier._id] = true;
    this.error = '';

    this.carrierService.requestContract(carrier._id).subscribe({
      next: (res) => {
        this.myStatuses[carrier._id!] = res.status;
        this.success = `Contract request submitted for ${carrier.name}`;
        this.statusLoading[carrier._id!] = false;
        setTimeout(() => this.success = '', 4000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to request contract';
        this.statusLoading[carrier._id!] = false;
      }
    });
  }

  getStatus(carrier: Carrier): AgentCarrierStatus | null {
    return carrier._id ? (this.myStatuses[carrier._id] || null) : null;
  }

  toggleCard(carrierId: string): void {
    if (this.expandedCards.has(carrierId)) this.expandedCards.delete(carrierId);
    else this.expandedCards.add(carrierId);
  }

  isExpanded(carrierId: string): boolean {
    return this.expandedCards.has(carrierId);
  }

  getGuideUrl(path: string): string {
    return `${environment.apiUrl.replace('/api', '')}/${path}`;
  }

  get currentCarriers(): Carrier[] {
    return this.carriersByCategory[this.activeTab] || [];
  }
}
