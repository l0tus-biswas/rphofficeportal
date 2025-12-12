import { Component, OnInit } from '@angular/core';
import { AgentService } from '../../services/agent.service';
import { AuthService } from '../../services/auth.service';
import { User } from '../../models/user.model';

interface TreeNode {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  level: number;
  children: TreeNode[];
  expanded?: boolean;
}

interface DownlineStats {
  totalMembers: number;
  totalActive: number;
  totalInactive: number;
  levels: number;
  levelStats: { [key: number]: { total: number; active: number; inactive: number } };
}

@Component({
  selector: 'app-downline',
  templateUrl: './downline.component.html',
  styleUrls: ['./downline.component.css']
})
export class DownlineComponent implements OnInit {
  user: User | null = null;
  downlineTree: TreeNode | null = null;
  stats: DownlineStats = {
    totalMembers: 0,
    totalActive: 0,
    totalInactive: 0,
    levels: 0,
    levelStats: {}
  };
  loading: boolean = false;
  error: string = '';
  showReferrerModal = false;

  constructor(
    private agentService: AgentService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.user = this.authService.getCurrentUser();
    this.loadDownline();
  }

  loadDownline(): void {
    this.loading = true;
    this.error = '';

    this.agentService.getDownline().subscribe({
      next: (response: any) => {
        this.downlineTree = this.processTree(response.downline, 1);
        this.stats = response.stats || this.stats;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading downline:', error);
        this.error = error.error?.message || 'Failed to load downline';
        this.loading = false;
      }
    });
  }

  // Process tree and add level and expanded properties
  processTree(node: any, level: number): TreeNode | null {
    if (!node) return null;

    const processedNode: TreeNode = {
      ...node,
      level,
      expanded: level <= 2, // Auto-expand first 2 levels
      children: []
    };

    if (node.children && node.children.length > 0) {
      processedNode.children = node.children
        .map((child: any) => this.processTree(child, level + 1))
        .filter((child: TreeNode | null) => child !== null) as TreeNode[];
    }

    return processedNode;
  }

  // Toggle node expansion
  toggleNode(node: TreeNode): void {
    node.expanded = !node.expanded;
  }

  // Expand all nodes
  expandAll(): void {
    this.expandNodeRecursive(this.downlineTree);
  }

  // Collapse all nodes except first level
  collapseAll(): void {
    this.collapseNodeRecursive(this.downlineTree, 1);
  }

  private expandNodeRecursive(node: TreeNode | null): void {
    if (!node) return;
    node.expanded = true;
    node.children.forEach(child => this.expandNodeRecursive(child));
  }

  private collapseNodeRecursive(node: TreeNode | null, currentLevel: number): void {
    if (!node) return;
    node.expanded = currentLevel <= 1;
    node.children.forEach(child => this.collapseNodeRecursive(child, currentLevel + 1));
  }

  // Helper methods for UI
  getStatusBadgeClass(isActive: boolean): string {
    return isActive ? 'bg-success' : 'bg-secondary';
  }

  getStatusText(isActive: boolean): string {
    return isActive ? 'Active' : 'Inactive';
  }

  getRoleIcon(role: string): string {
    const icons: { [key: string]: string } = {
      'admin': 'bi-shield-fill-check text-danger',
      'agent': 'bi-person-badge-fill text-primary',
      'recruit': 'bi-person-fill text-success'
    };
    return icons[role.toLowerCase()] || 'bi-person-fill text-secondary';
  }

  getLevelColor(level: number): string {
    const colors = ['#0d6efd', '#198754', '#ffc107', '#dc3545', '#6f42c1', '#20c997'];
    return colors[(level - 1) % colors.length];
  }

  // Get level stats array for display
  getLevelStatsArray(): Array<{ level: number; stats: any }> {
    return Object.keys(this.stats.levelStats)
      .map(key => ({ level: parseInt(key), stats: this.stats.levelStats[parseInt(key)] }))
      .sort((a, b) => a.level - b.level);
  }

  showReferrerInfo(): void {
    this.showReferrerModal = true;
  }

  closeReferrerInfo(): void {
    this.showReferrerModal = false;
  }
}
