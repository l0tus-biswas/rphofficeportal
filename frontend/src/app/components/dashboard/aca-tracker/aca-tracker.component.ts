import { Component, OnInit } from '@angular/core';
import { AcaService, AcaTrackerData } from '../../../services/aca.service';

@Component({
  selector: 'app-aca-tracker',
  templateUrl: './aca-tracker.component.html',
  styleUrls: ['./aca-tracker.component.css']
})
export class AcaTrackerComponent implements OnInit {
  data: AcaTrackerData | null = null;
  loading = true;
  error = '';

  readonly TIER_COLORS: Record<number, string> = {
    0: 'secondary',
    1: 'info',
    2: 'primary',
    3: 'success'
  };

  constructor(private acaService: AcaService) {}

  ngOnInit(): void {
    this.acaService.getTrackerData().subscribe({
      next: (res: any) => {
        this.data = res as AcaTrackerData;
        this.loading = false;
      },
      error: (err: any) => {
        this.error = err?.error?.message || 'Failed to load ACA tracker data.';
        this.loading = false;
      }
    });
  }

  get tierColor(): string {
    return this.TIER_COLORS[this.data?.currentTier ?? 0] || 'secondary';
  }

  get bonusFormatted(): string {
    if (!this.data || this.data.bonusAmount === 0) return '$0';
    return '$' + this.data.bonusAmount.toLocaleString('en-US');
  }

  get batchDisplay(): string {
    if (!this.data?.uploadBatch) return '—';
    const match = this.data.uploadBatch.match(/^(\d{4})-(\d{2})$/);
    if (match) {
      const date = new Date(parseInt(match[1]), parseInt(match[2]) - 1, 1);
      return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    return this.data.uploadBatch;
  }

  /** Compare colour: green if verified >= reported, amber otherwise */
  compareColor(reported: number, verified: number): string {
    if (verified >= reported) return 'success';
    return 'warning';
  }

  formatCurrency(amount: number): string {
    return '$' + (amount || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
}
