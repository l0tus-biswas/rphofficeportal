import { Component, OnInit } from '@angular/core';
import { BusinessCardsService, PrintfulAdminConfig, OptionField } from '../../../services/business-cards.service';

@Component({
  selector: 'app-vistaprint-config',
  templateUrl: './vistaprint-config.component.html',
  styleUrls: ['./vistaprint-config.component.css']
})
export class VistaprintConfigComponent implements OnInit {
  // Form model
  apiKey = '';
  storeId = '';
  enabled = false;

  // Text fields for personalization
  textFields: OptionField[] = [];

  // Current saved config
  config: PrintfulAdminConfig | null = null;

  // State
  loading = true;
  saving = false;
  testing = false;
  error = '';
  successMessage = '';
  testMessage = '';
  testError = '';

  constructor(private businessCardsService: BusinessCardsService) {}

  ngOnInit(): void {
    this.loadConfig();
  }

  loadConfig(): void {
    this.loading = true;
    this.businessCardsService.getAdminConfig().subscribe({
      next: (res) => {
        this.config = res.config;
        this.storeId = res.config.storeId || '';
        this.enabled = res.config.enabled;
        this.textFields = res.config.textFields || [];
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to load configuration.';
        this.loading = false;
      }
    });
  }

  saveConfig(): void {
    this.saving = true;
    this.error = '';
    this.successMessage = '';

    const body: any = {
      storeId: this.storeId,
      enabled: this.enabled,
      textFields: this.textFields
    };

    if (this.apiKey) {
      body.apiKey = this.apiKey;
    }

    this.businessCardsService.updateConfig(body).subscribe({
      next: (res) => {
        this.config = res.config;
        this.textFields = res.config.textFields || [];
        this.successMessage = 'Configuration saved.';
        this.saving = false;
        this.apiKey = '';
        setTimeout(() => this.successMessage = '', 4000);
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to save configuration.';
        this.saving = false;
      }
    });
  }

  addTextField(): void {
    this.textFields.push({ id: Date.now().toString(), label: '', required: false });
  }

  removeTextField(index: number): void {
    this.textFields.splice(index, 1);
  }

  testConnection(): void {
    this.testing = true;
    this.testMessage = '';
    this.testError = '';

    this.businessCardsService.testConnection().subscribe({
      next: (res) => {
        this.testMessage = `${res.message} Store: ${res.store?.name || 'N/A'}`;
        this.testing = false;
        setTimeout(() => this.testMessage = '', 6000);
      },
      error: (err) => {
        this.testError = err?.error?.message || 'Connection test failed.';
        this.testing = false;
      }
    });
  }
}
