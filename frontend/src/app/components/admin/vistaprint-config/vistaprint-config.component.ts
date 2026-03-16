import { Component, OnInit } from '@angular/core';
import { BusinessCardsService, VistaprintConfig } from '../../../services/business-cards.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-vistaprint-config',
  templateUrl: './vistaprint-config.component.html',
  styleUrls: ['./vistaprint-config.component.css']
})
export class VistaprintConfigComponent implements OnInit {
  // Form model
  englishUrl = '';
  spanishUrl = '';
  affiliateId = '';

  // Current saved config
  config: VistaprintConfig | null = null;

  // State
  loading = true;
  saving = false;
  uploadingEnglish = false;
  uploadingSpanish = false;
  error = '';
  successMessage = '';
  uploadSuccessEnglish = '';
  uploadSuccessSpanish = '';
  uploadErrorEnglish = '';
  uploadErrorSpanish = '';

  private baseUrl = environment.apiUrl.replace('/api', '');

  constructor(private businessCardsService: BusinessCardsService) {}

  ngOnInit(): void {
    this.loadConfig();
  }

  loadConfig(): void {
    this.loading = true;
    this.businessCardsService.getConfig().subscribe({
      next: (res) => {
        this.config = res.config;
        this.englishUrl = res.config.englishUrl || '';
        this.spanishUrl = res.config.spanishUrl || '';
        this.affiliateId = res.config.affiliateId || '';
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

    this.businessCardsService.updateConfig({
      englishUrl: this.englishUrl,
      spanishUrl: this.spanishUrl,
      affiliateId: this.affiliateId
    }).subscribe({
      next: (res) => {
        this.config = res.config;
        this.successMessage = 'Configuration saved successfully.';
        this.saving = false;
        setTimeout(() => this.successMessage = '', 4000);
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to save configuration.';
        this.saving = false;
      }
    });
  }

  uploadPreview(event: Event, lang: 'english' | 'spanish'): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || !input.files[0]) return;

    const formData = new FormData();
    formData.append('preview', input.files[0]);
    formData.append('language', lang);

    if (lang === 'english') {
      this.uploadingEnglish = true;
      this.uploadSuccessEnglish = '';
      this.uploadErrorEnglish = '';
    } else {
      this.uploadingSpanish = true;
      this.uploadSuccessSpanish = '';
      this.uploadErrorSpanish = '';
    }

    this.businessCardsService.uploadPreview(formData).subscribe({
      next: (res) => {
        if (this.config) {
          if (lang === 'english') {
            this.config.englishPreview = res.path;
            this.uploadSuccessEnglish = 'English preview uploaded.';
            this.uploadingEnglish = false;
            setTimeout(() => this.uploadSuccessEnglish = '', 4000);
          } else {
            this.config.spanishPreview = res.path;
            this.uploadSuccessSpanish = 'Spanish preview uploaded.';
            this.uploadingSpanish = false;
            setTimeout(() => this.uploadSuccessSpanish = '', 4000);
          }
        }
        input.value = '';
      },
      error: (err) => {
        const msg = err?.error?.message || 'Upload failed.';
        if (lang === 'english') {
          this.uploadErrorEnglish = msg;
          this.uploadingEnglish = false;
        } else {
          this.uploadErrorSpanish = msg;
          this.uploadingSpanish = false;
        }
        input.value = '';
      }
    });
  }

  getPreviewUrl(path: string): string {
    if (!path) return '';
    return `${this.baseUrl}/${path}`;
  }
}
