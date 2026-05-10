import { Component, OnInit } from '@angular/core';
import { AdminService } from '../../../services/admin.service';

interface TreeNode {
  _id: string;
  name: string;
  email: string;
  role: string;
  level?: string;
  referralCode?: string;
  isActive: boolean;
  isLicensed?: boolean;
  createdAt: string;
  children: TreeNode[];
  expanded?: boolean;
  treeLevel?: number;
}

@Component({
  selector: 'app-hierarchy',
  templateUrl: './hierarchy.component.html',
  styleUrls: ['./hierarchy.component.css']
})
export class HierarchyComponent implements OnInit {
  hierarchy: TreeNode[] = [];
  flattenedHierarchy: TreeNode[] = [];
  loading = false;
  error = '';
  searchTerm = '';
  
  // Statistics (from server)
  totalUsers = 0;
  totalAdmins = 0;
  totalAgents = 0;
  totalLicensed = 0;
  totalUnlicensed = 0;
  maxDepth = 0;

  // Role edit state
  editingRole: string | null = null;
  savingRole = false;

  constructor(private adminService: AdminService) { }

  ngOnInit(): void {
    this.loadHierarchy();
  }

  loadHierarchy(): void {
    this.loading = true;
    this.error = '';
    
    this.adminService.getHierarchy().subscribe({
      next: (response: any) => {
        this.hierarchy = response.hierarchy || [];
        // Use server-computed counts if available
        if (response.counts) {
          this.totalUsers = response.counts.totalUsers || 0;
          this.totalAdmins = response.counts.totalAdmins || 0;
          this.totalAgents = response.counts.totalAgents || 0;
          this.totalLicensed = response.counts.totalLicensed || 0;
          this.totalUnlicensed = response.counts.totalUnlicensed || 0;
        } else {
          this.calculateStatistics(this.hierarchy);
        }
        this.flattenHierarchy();
        this.loading = false;
      },
      error: (error: any) => {
        this.error = error.error?.message || 'Failed to load hierarchy';
        this.loading = false;
      }
    });
  }

  calculateStatistics(nodes: TreeNode[], depth: number = 0): void {
    nodes.forEach(node => {
      this.totalUsers++;
      if (node.role === 'admin') this.totalAdmins++;
      else {
        this.totalAgents++;
        if (node.isLicensed) this.totalLicensed++;
        else this.totalUnlicensed++;
      }
      
      if (depth > this.maxDepth) this.maxDepth = depth;
      
      if (node.children && node.children.length > 0) {
        this.calculateStatistics(node.children, depth + 1);
      }
    });
  }

  flattenHierarchy(): void {
    this.flattenedHierarchy = [];
    const flatten = (nodes: TreeNode[], level: number = 0) => {
      nodes.forEach(node => {
        node.treeLevel = level;
        node.expanded = level < 2;
        this.flattenedHierarchy.push(node);
        if (node.children && node.children.length > 0) {
          flatten(node.children, level + 1);
        }
      });
    };
    flatten(this.hierarchy);
  }

  toggleNode(node: TreeNode): void {
    node.expanded = !node.expanded;
  }

  shouldShowNode(node: TreeNode): boolean {
    if (this.searchTerm) {
      return node.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
             node.email.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
             (node.referralCode ? node.referralCode.toLowerCase().includes(this.searchTerm.toLowerCase()) : false);
    }
    
    let parent = this.findParent(node);
    while (parent) {
      if (!parent.expanded) return false;
      parent = this.findParent(parent);
    }
    return true;
  }

  findParent(node: TreeNode): TreeNode | null {
    const findInNodes = (nodes: TreeNode[], target: TreeNode): TreeNode | null => {
      for (const n of nodes) {
        if (n.children && n.children.includes(target)) {
          return n;
        }
        if (n.children) {
          const found = findInNodes(n.children, target);
          if (found) return found;
        }
      }
      return null;
    };
    return findInNodes(this.hierarchy, node);
  }

  expandAll(): void {
    this.flattenedHierarchy.forEach(node => node.expanded = true);
  }

  collapseAll(): void {
    this.flattenedHierarchy.forEach(node => node.expanded = false);
  }

  // Role display: show actual role with licensing status (§21.3)
  getDisplayRole(node: TreeNode): string {
    if (node.role === 'admin') return 'Admin';
    return 'Agent';
  }

  getRoleBadgeClass(node: TreeNode): string {
    if (node.role === 'admin') return 'bg-danger';
    return 'bg-primary';
  }

  getLicenseBadgeClass(node: TreeNode): string {
    if (node.role === 'admin') return '';
    return node.isLicensed ? 'bg-success' : 'bg-warning text-dark';
  }

  getLicenseLabel(node: TreeNode): string {
    if (node.role === 'admin') return '';
    return node.isLicensed ? 'Licensed' : 'Unlicensed';
  }

  getIndentation(level: number): string {
    return `${level * 30}px`;
  }

  hasChildren(node: TreeNode): boolean {
    return node.children && node.children.length > 0;
  }

  // Role management (§21.2)
  startEditRole(node: TreeNode): void {
    this.editingRole = node._id;
  }

  cancelEditRole(): void {
    this.editingRole = null;
  }

  toggleRole(node: TreeNode): void {
    const newRole = node.role === 'admin' ? 'agent' : 'admin';
    this.savingRole = true;
    this.adminService.updateUser(node._id, { role: newRole }).subscribe({
      next: () => {
        node.role = newRole;
        this.editingRole = null;
        this.savingRole = false;
        // Recalculate counts
        this.totalUsers = 0;
        this.totalAdmins = 0;
        this.totalAgents = 0;
        this.totalLicensed = 0;
        this.totalUnlicensed = 0;
        this.maxDepth = 0;
        this.calculateStatistics(this.hierarchy);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to update role';
        this.editingRole = null;
        this.savingRole = false;
      }
    });
  }

  exportHierarchy(): void {
    const dataStr = JSON.stringify(this.hierarchy, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `hierarchy-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }
}
