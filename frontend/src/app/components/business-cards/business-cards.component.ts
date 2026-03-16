import { Component, OnInit } from '@angular/core';
import { BusinessCardsService, VistaprintConfig } from '../../services/business-cards.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-business-cards',
  templateUrl: './business-cards.component.html',
  styleUrls: ['./business-cards.component.css']
})
export class BusinessCardsComponent implements OnInit {
  config: VistaprintConfig | null = null;
  loading = true;
  error = '';

  /** Base URL for serving uploaded images (strip /api suffix) */
  private baseUrl = environment.apiUrl.replace('/api', '');

  constructor(private businessCardsService: BusinessCardsService) {}

  ngOnInit(): void {
    this.businessCardsService.getConfig().subscribe({
      next: (res) => {
        this.config = res.config;
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to load business card options.';
        this.loading = false;
      }
    });
  }

  getPreviewUrl(path: string): string {
    if (!path) return '';
    return `${this.baseUrl}/${path}`;
  }

  orderNow(lang: 'english' | 'spanish'): void {
    const url = lang === 'english' ? this.config?.englishUrl : this.config?.spanishUrl;
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  get hasEnglishUrl(): boolean {
    return !!(this.config?.englishUrl && this.config.englishUrl !== 'https://www.vistaprint.com/business-cards');
  }

  get hasSpanishUrl(): boolean {
    return !!(this.config?.spanishUrl && this.config.spanishUrl !== 'https://www.vistaprint.com/business-cards');
  }
}
