import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface SystemConfig {
  _id: string;
  key: string;
  value: string;
  actualValue: string;
  category: string;
  description?: string;
  isSecret: boolean;
  isEditable: boolean;
  updatedAt: Date;
}

interface GroupedConfigs {
  [category: string]: SystemConfig[];
}

@Component({
  selector: 'app-system-config',
  templateUrl: './system-config.component.html',
  styleUrls: ['./system-config.component.css']
})
export class SystemConfigComponent implements OnInit {
  configs: GroupedConfigs = {};
  categories: string[] = [];
  loading: boolean = false;
  saving: boolean = false;
  syncing: boolean = false;
  error: string = '';
  success: string = '';
  
  editingConfig: SystemConfig | null = null;
  editValue: string = '';
  showEditModal: boolean = false;
  
  showAddModal: boolean = false;
  newConfig = {
    key: '',
    value: '',
    category: 'application',
    description: '',
    isSecret: false,
    isEditable: true
  };
  
  visibleSecrets: Set<string> = new Set();

  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    this.loadConfigs();
  }

  loadConfigs(): void {
    this.loading = true;
    this.error = '';
    
    this.http.get<any>(`${environment.apiUrl}/admin/config`).subscribe({
      next: (response) => {
        this.configs = response.data?.configs || response.configs || {};
        this.categories = Object.keys(this.configs);
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to load configurations';
        this.loading = false;
      }
    });
  }

  openEditModal(config: SystemConfig): void {
    if (!config.isEditable) {
      this.error = 'This configuration is not editable';
      setTimeout(() => this.error = '', 3000);
      return;
    }
    
    this.editingConfig = config;
    this.editValue = config.actualValue;
    this.showEditModal = true;
    this.error = '';
    this.success = '';
  }

  closeEditModal(): void {
    this.showEditModal = false;
    this.editingConfig = null;
    this.editValue = '';
  }

  saveConfig(): void {
    if (!this.editingConfig) return;
    
    this.saving = true;
    this.error = '';
    this.success = '';
    
    const payload = {
      key: this.editingConfig.key,
      value: this.editValue,
      category: this.editingConfig.category,
      description: this.editingConfig.description,
      isSecret: this.editingConfig.isSecret,
      isEditable: this.editingConfig.isEditable
    };
    
    this.http.post<any>(`${environment.apiUrl}/admin/config`, payload).subscribe({
      next: (response) => {
        this.success = response.message || 'Configuration updated successfully';
        this.saving = false;
        this.closeEditModal();
        this.loadConfigs();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to update configuration';
        this.saving = false;
      }
    });
  }

  openAddModal(): void {
    this.showAddModal = true;
    this.newConfig = {
      key: '',
      value: '',
      category: 'application',
      description: '',
      isSecret: false,
      isEditable: true
    };
    this.error = '';
    this.success = '';
  }

  closeAddModal(): void {
    this.showAddModal = false;
  }

  addConfig(): void {
    if (!this.newConfig.key || !this.newConfig.value) {
      this.error = 'Key and value are required';
      return;
    }
    
    this.saving = true;
    this.error = '';
    this.success = '';
    
    this.http.post<any>(`${environment.apiUrl}/admin/config`, this.newConfig).subscribe({
      next: (response) => {
        this.success = response.message || 'Configuration added successfully';
        this.saving = false;
        this.closeAddModal();
        this.loadConfigs();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to add configuration';
        this.saving = false;
      }
    });
  }

  deleteConfig(config: SystemConfig): void {
    if (!config.isEditable) {
      this.error = 'This configuration cannot be deleted';
      setTimeout(() => this.error = '', 3000);
      return;
    }
    
    if (!confirm(`Are you sure you want to delete ${config.key}?`)) {
      return;
    }
    
    this.error = '';
    this.success = '';
    
    this.http.delete<any>(`${environment.apiUrl}/admin/config/${config._id}`).subscribe({
      next: (response) => {
        this.success = response.message || 'Configuration deleted successfully';
        this.loadConfigs();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to delete configuration';
      }
    });
  }

  syncFromEnv(): void {
    if (!confirm('This will sync configurations from the .env file to the database. Continue?')) {
      return;
    }
    
    this.syncing = true;
    this.error = '';
    this.success = '';
    
    this.http.post<any>(`${environment.apiUrl}/admin/config/sync-from-env`, {}).subscribe({
      next: (response) => {
        this.success = response.message || 'Synced successfully';
        this.syncing = false;
        this.loadConfigs();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to sync from .env';
        this.syncing = false;
      }
    });
  }

  getCategoryBadgeClass(category: string): string {
    const badgeMap: { [key: string]: string } = {
      'database': 'bg-primary',
      'server': 'bg-success',
      'email': 'bg-info',
      'jwt': 'bg-warning',
      'application': 'bg-secondary',
      'other': 'bg-dark'
    };
    return badgeMap[category] || 'bg-secondary';
  }

  copyToClipboard(value: string): void {
    navigator.clipboard.writeText(value).then(() => {
      this.success = 'Copied to clipboard';
      setTimeout(() => this.success = '', 2000);
    }).catch(() => {
      this.error = 'Failed to copy';
      setTimeout(() => this.error = '', 2000);
    });
  }
  
  toggleSecretVisibility(configId: string): void {
    if (this.visibleSecrets.has(configId)) {
      this.visibleSecrets.delete(configId);
    } else {
      this.visibleSecrets.add(configId);
    }
  }
  
  isSecretVisible(configId: string): boolean {
    return this.visibleSecrets.has(configId);
  }
  
  getDisplayValue(config: SystemConfig): string {
    if (config.isSecret && !this.isSecretVisible(config._id)) {
      return '••••••••';
    }
    return config.actualValue;
  }
}
