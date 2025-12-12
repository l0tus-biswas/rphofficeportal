import { Component, OnInit } from '@angular/core';
import { AdminService } from '../../../services/admin.service';

interface TreeNode {
  _id: string;
  name: string;
  email: string;
  role: string;
  referralCode?: string;
  isActive: boolean;
  createdAt: string;
  children: TreeNode[];
  expanded?: boolean;
  level?: number;
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
  
  // Statistics
  totalUsers = 0;
  totalAdmins = 0;
  totalAgents = 0;
  totalRecruits = 0;
  maxDepth = 0;

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
        this.calculateStatistics(this.hierarchy);
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
      if (node.role === 'agent') this.totalAgents++;
      if (node.role === 'recruit') this.totalRecruits++;
      
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
        node.level = level;
        node.expanded = level < 2; // Expand first 2 levels by default
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
    
    // Check if parent is expanded
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

  getRoleBadgeClass(role: string): string {
    const classes: any = {
      'admin': 'bg-danger',
      'agent': 'bg-primary',
      'recruit': 'bg-secondary'
    };
    return classes[role] || 'bg-secondary';
  }

  getIndentation(level: number): string {
    return `${level * 30}px`;
  }

  hasChildren(node: TreeNode): boolean {
    return node.children && node.children.length > 0;
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
