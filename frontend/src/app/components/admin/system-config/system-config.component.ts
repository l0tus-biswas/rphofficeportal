import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
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
  siteAccessLoading: boolean = false;
  siteAccessSaving: boolean = false;
  error: string = '';
  success: string = '';

  siteAccessEnabled: boolean = true;
  siteAccessMessage: string = 'RHP Office is temporarily under maintenance. Please check back shortly.';

  // Email configuration state
  emailConfig = { fromName: '', fromEmail: '', replyTo: '' };
  emailLoading: boolean = false;
  emailSaving: boolean = false;
  emailTesting: boolean = false;
  testEmailRecipient: string = '';
  
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

  // QuickBooks state
  qboStatus: any = null;
  qboLoading = false;
  qboConnecting = false;
  qboSyncLoading = false;
  qboSyncing = false;
  qboSyncData: any = null;
  qboSyncResult: any = null;
  syncingAgentId = '';
  showSyncedList = false;
  showNotLicensedList = false;

  constructor(private http: HttpClient, private route: ActivatedRoute) { }

  ngOnInit(): void {
    this.loadConfigs();
    this.loadSiteAccess();
    this.loadEmailConfig();
    this.loadQBOStatus();

    // Handle redirect from QuickBooks OAuth
    this.route.queryParams.subscribe(params => {
      if (params['qbo'] === 'connected') {
        this.success = 'QuickBooks Online connected successfully!';
        setTimeout(() => this.success = '', 5000);
        this.loadQBOStatus();
      }
    });
  }

  loadSiteAccess(): void {
    this.siteAccessLoading = true;
    this.http.get<any>(`${environment.apiUrl}/admin/config/site-access`).subscribe({
      next: (response) => {
        const enabled = response?.siteAccessEnabled ?? response?.data?.siteAccessEnabled;
        const message = response?.siteAccessMessage ?? response?.data?.siteAccessMessage;
        this.siteAccessEnabled = enabled !== false;
        if (message) {
          this.siteAccessMessage = message;
        }
        this.siteAccessLoading = false;
      },
      error: () => {
        this.siteAccessLoading = false;
      }
    });
  }

  saveSiteAccess(): void {
    this.siteAccessSaving = true;
    this.error = '';
    this.success = '';

    this.http.put<any>(`${environment.apiUrl}/admin/config/site-access`, {
      enabled: this.siteAccessEnabled,
      message: this.siteAccessMessage
    }).subscribe({
      next: (response) => {
        this.success = response?.message || 'Site access settings updated';
        this.siteAccessSaving = false;
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to update site access settings';
        this.siteAccessSaving = false;
      }
    });
  }

  onSiteAccessToggle(): void {
    this.saveSiteAccess();
  }

  // ── Email Configuration ───────────────────────────────────────────────

  loadEmailConfig(): void {
    this.emailLoading = true;
    this.http.get<any>(`${environment.apiUrl}/admin/config/email`).subscribe({
      next: (response) => {
        const email = response?.email ?? response?.data?.email;
        if (email) {
          this.emailConfig = {
            fromName: email.fromName || '',
            fromEmail: email.fromEmail || '',
            replyTo: email.replyTo || ''
          };
        }
        this.emailLoading = false;
      },
      error: () => {
        this.emailLoading = false;
      }
    });
  }

  saveEmailConfig(): void {
    if (!this.emailConfig.fromName?.trim() || !this.emailConfig.fromEmail?.trim()) {
      this.error = 'Sender name and sender email are required';
      setTimeout(() => this.error = '', 3000);
      return;
    }

    this.emailSaving = true;
    this.error = '';
    this.success = '';

    this.http.put<any>(`${environment.apiUrl}/admin/config/email`, {
      fromName: this.emailConfig.fromName,
      fromEmail: this.emailConfig.fromEmail,
      replyTo: this.emailConfig.replyTo
    }).subscribe({
      next: (response) => {
        this.success = response?.message || 'Email configuration updated';
        this.emailSaving = false;
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to update email configuration';
        this.emailSaving = false;
      }
    });
  }

  sendTestEmail(): void {
    this.emailTesting = true;
    this.error = '';
    this.success = '';

    this.http.post<any>(`${environment.apiUrl}/admin/config/email/test`, {
      email: this.testEmailRecipient?.trim() || undefined
    }).subscribe({
      next: (response) => {
        this.success = response?.message || 'Test email sent';
        this.emailTesting = false;
        setTimeout(() => this.success = '', 4000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to send test email';
        this.emailTesting = false;
      }
    });
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

  // ── QuickBooks Methods ────────────────────────────────────────────────

  loadQBOStatus(): void {
    this.qboLoading = true;
    this.http.get<any>(`${environment.apiUrl}/quickbooks/status`).subscribe({
      next: (status) => {
        this.qboStatus = status;
        this.qboLoading = false;
      },
      error: () => {
        this.qboStatus = { connected: false };
        this.qboLoading = false;
      }
    });
  }

  connectQBO(): void {
    this.qboConnecting = true;
    this.http.get<any>(`${environment.apiUrl}/quickbooks/connect`).subscribe({
      next: (res) => {
        this.qboConnecting = false;
        if (res.authUri) {
          window.location.href = res.authUri;
        }
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to start QuickBooks authorization';
        this.qboConnecting = false;
      }
    });
  }

  disconnectQBO(): void {
    if (!confirm('Disconnect from QuickBooks Online? Contractor sync will stop working.')) return;
    this.http.post<any>(`${environment.apiUrl}/quickbooks/disconnect`, {}).subscribe({
      next: () => {
        this.success = 'QuickBooks disconnected';
        this.qboStatus = { connected: false };
        this.qboSyncData = null;
        this.qboSyncResult = null;
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to disconnect';
      }
    });
  }

  loadQBOSyncStatus(): void {
    this.qboSyncLoading = true;
    this.http.get<any>(`${environment.apiUrl}/quickbooks/sync-status`).subscribe({
      next: (data) => {
        this.qboSyncData = data;
        this.qboSyncLoading = false;
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to load sync status';
        this.qboSyncLoading = false;
      }
    });
  }

  syncAllContractors(): void {
    if (!confirm('Sync all unsynced, licensed agents to QuickBooks as 1099 contractors?')) return;
    this.qboSyncing = true;
    this.qboSyncResult = null;
    this.http.post<any>(`${environment.apiUrl}/quickbooks/sync-all-contractors`, {}).subscribe({
      next: (result) => {
        this.qboSyncResult = result;
        this.qboSyncing = false;
        this.loadQBOSyncStatus();
      },
      error: (err) => {
        this.error = err.error?.message || 'Bulk sync failed';
        this.qboSyncing = false;
      }
    });
  }

  syncSingleContractor(agentId: string, agentName: string): void {
    this.syncingAgentId = agentId;
    this.http.post<any>(`${environment.apiUrl}/quickbooks/sync-contractor/${agentId}`, {}).subscribe({
      next: (result) => {
        this.success = `${agentName} synced to QuickBooks (ID: ${result.contractor?.id}). ${result.nextStep || ''}`;
        this.syncingAgentId = '';
        this.loadQBOSyncStatus();
        setTimeout(() => this.success = '', 8000);
      },
      error: (err) => {
        this.error = err.error?.message || `Failed to sync ${agentName}`;
        this.syncingAgentId = '';
      }
    });
  }

  resyncContractor(agentId: string, agentName: string): void {
    this.syncingAgentId = agentId;
    this.http.post<any>(`${environment.apiUrl}/quickbooks/resync-contractor/${agentId}`, {}).subscribe({
      next: (result) => {
        this.success = `${agentName} updated in QuickBooks`;
        this.syncingAgentId = '';
        this.loadQBOSyncStatus();
        setTimeout(() => this.success = '', 4000);
      },
      error: (err) => {
        this.error = err.error?.message || `Failed to resync ${agentName}`;
        this.syncingAgentId = '';
      }
    });
  }
}
