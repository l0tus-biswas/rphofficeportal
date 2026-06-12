import { getAppTimezone } from '../../../services/timezone.service';
import { Component, OnInit } from '@angular/core';
import { AcaService, AcaTrackerData, AgentBreakdownEntry } from '../../../services/aca.service';

@Component({
  selector: 'app-aca-tracker',
  templateUrl: './aca-tracker.component.html',
  styleUrls: ['./aca-tracker.component.css']
})
export class AcaTrackerComponent implements OnInit {
  data: AcaTrackerData | null = null;
  loading = true;
  error = '';
  showBreakdown = false; // 5.14: expandable agent breakdown

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
    // Handle YYYY-MM
    const matchYM = this.data.uploadBatch.match(/^(\d{4})-(\d{2})$/);
    if (matchYM) {
      const date = new Date(parseInt(matchYM[1]), parseInt(matchYM[2]) - 1, 1);
      return date.toLocaleDateString('en-US', { timeZone: getAppTimezone(),  month: 'long', year: 'numeric' });
    }
    // Handle MM-YYYY
    const matchMY = this.data.uploadBatch.match(/^(\d{2})-(\d{4})$/);
    if (matchMY) {
      const date = new Date(parseInt(matchMY[2]), parseInt(matchMY[1]) - 1, 1);
      return date.toLocaleDateString('en-US', { timeZone: getAppTimezone(),  month: 'long', year: 'numeric' });
    }
    return this.data.uploadBatch;
  }

  compareColor(reported: number, verified: number): string {
    if (verified >= reported) return 'success';
    return 'warning';
  }

  formatCurrency(amount: number): string {
    return '$' + (amount || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  toggleBreakdown(): void {
    this.showBreakdown = !this.showBreakdown;
  }

  get selfEntry(): AgentBreakdownEntry | undefined {
    return this.data?.agentBreakdown?.find(a => a.isSelf);
  }

  get teamEntries(): AgentBreakdownEntry[] {
    return this.data?.agentBreakdown?.filter(a => !a.isSelf) || [];
  }
}
