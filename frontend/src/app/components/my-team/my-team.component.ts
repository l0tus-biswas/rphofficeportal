import { Component, OnInit } from '@angular/core';
import { AgentService } from '../../services/agent.service';
import { AuthService } from '../../services/auth.service';

interface TeamMember {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  isLicensed: boolean;
  createdAt: string;
  referralCode?: string;
  treeLevel: number;
  recruitedByName?: string;
  children?: TeamMember[];
  expanded?: boolean;
}

interface TeamStats {
  totalMembers: number;
  totalActive: number;
  totalInactive: number;
  totalLicensed: number;
  totalUnlicensed: number;
  directRecruits: number;
  filtered: number;
  levelStats: { [key: number]: { total: number; active: number; inactive: number; licensed: number } };
}

@Component({
  selector: 'app-my-team',
  templateUrl: './my-team.component.html',
  styleUrls: ['./my-team.component.css']
})
export class MyTeamComponent implements OnInit {
  // View toggle
  viewMode: 'tree' | 'list' = 'list';

  // Data
  treeData: TeamMember[] = [];
  listData: TeamMember[] = [];
  stats: TeamStats = {
    totalMembers: 0, totalActive: 0, totalInactive: 0,
    totalLicensed: 0, totalUnlicensed: 0, directRecruits: 0,
    filtered: 0, levelStats: {}
  };

  // State
  loading = false;
  error = '';

  // Filters
  searchTerm = '';
  statusFilter = '';
  licensedFilter = '';
  datePreset = '';
  dateFrom = '';
  dateTo = '';
  sortBy = '-createdAt';

  // Pagination (list view)
  currentPage = 1;
  pageSize = 50;
  totalPages = 1;

  // Copied referral code feedback
  copiedCode: string | null = null;

  constructor(
    private agentService: AgentService,
    public authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadTeam();
  }

  loadTeam(): void {
    this.loading = true;
    this.error = '';

    const params: any = {
      view: this.viewMode,
      page: this.currentPage,
      limit: this.pageSize,
      sortBy: this.sortBy
    };
    if (this.searchTerm) params.search = this.searchTerm;
    if (this.statusFilter) params.status = this.statusFilter;
    if (this.licensedFilter) params.licensed = this.licensedFilter;
    if (this.datePreset) {
      params.datePreset = this.datePreset;
    } else {
      if (this.dateFrom) params.dateFrom = this.dateFrom;
      if (this.dateTo) params.dateTo = this.dateTo;
    }

    this.agentService.getMyTeam(params).subscribe({
      next: (response: any) => {
        this.stats = response.stats || this.stats;
        if (this.viewMode === 'tree') {
          this.treeData = this.processTreeNodes(response.tree || [], 1);
        } else {
          this.listData = response.members || [];
          this.totalPages = response.pagination?.pages || 1;
        }
        this.loading = false;
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to load team data';
        this.loading = false;
      }
    });
  }

  // ─── Tree processing ───
  processTreeNodes(nodes: any[], level: number): TeamMember[] {
    return nodes.map(node => ({
      ...node,
      treeLevel: level,
      expanded: level <= 2,
      children: node.children ? this.processTreeNodes(node.children, level + 1) : []
    }));
  }

  toggleNode(node: TeamMember): void {
    node.expanded = !node.expanded;
  }

  expandAll(): void {
    this.setExpanded(this.treeData, true);
  }

  collapseAll(): void {
    this.setExpanded(this.treeData, false);
  }

  private setExpanded(nodes: TeamMember[], expanded: boolean): void {
    nodes.forEach(n => {
      n.expanded = expanded;
      if (n.children) this.setExpanded(n.children, expanded);
    });
  }

  // ─── Filter handlers ───
  onFilterChange(): void {
    this.currentPage = 1;
    this.loadTeam();
  }

  onViewToggle(mode: 'tree' | 'list'): void {
    this.viewMode = mode;
    this.currentPage = 1;
    this.loadTeam();
  }

  onDatePresetChange(): void {
    if (this.datePreset) {
      this.dateFrom = '';
      this.dateTo = '';
    }
    this.onFilterChange();
  }

  onCustomDateChange(): void {
    this.datePreset = '';
    this.onFilterChange();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.statusFilter = '';
    this.licensedFilter = '';
    this.datePreset = '';
    this.dateFrom = '';
    this.dateTo = '';
    this.onFilterChange();
  }

  // ─── Pagination ───
  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadTeam();
  }

  // ─── UI Helpers ───
  getStatusBadgeClass(isActive: boolean): string {
    return isActive ? 'bg-success' : 'bg-secondary';
  }

  getStatusText(isActive: boolean): string {
    return isActive ? 'Active' : 'Inactive';
  }

  getLicenseBadgeClass(isLicensed: boolean): string {
    return isLicensed ? 'bg-info' : 'bg-warning text-dark';
  }

  getLicenseText(isLicensed: boolean): string {
    return isLicensed ? 'Licensed' : 'Unlicensed';
  }

  getRoleIcon(role: string): string {
    const icons: any = {
      'admin': 'bi-shield-fill-check text-danger',
      'agent': 'bi-person-badge-fill text-primary'
    };
    return icons[role?.toLowerCase()] || 'bi-person-fill text-secondary';
  }

  getLevelColor(level: number): string {
    const colors = ['#0d6efd', '#198754', '#ffc107', '#dc3545', '#6f42c1', '#20c997'];
    return colors[(level - 1) % colors.length];
  }

  getLevelStatsArray(): { level: number; stats: any }[] {
    if (!this.stats.levelStats) return [];
    return Object.keys(this.stats.levelStats)
      .map(k => ({ level: parseInt(k), stats: this.stats.levelStats[parseInt(k)] }))
      .sort((a, b) => a.level - b.level);
  }

  copyToClipboard(code: string): void {
    const fullUrl = `${window.location.origin}/apply?ref=${code}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      this.copiedCode = code;
      setTimeout(() => this.copiedCode = null, 2000);
    }).catch(err => console.error('Copy failed:', err));
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  }
}
