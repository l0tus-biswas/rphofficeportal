import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { PromotionService, PromotionTrackerData, PromotionLevel } from '../../../services/promotion.service';

@Component({
  selector: 'app-promotion-tracker',
  templateUrl: './promotion-tracker.component.html',
  styleUrls: ['./promotion-tracker.component.css']
})
export class PromotionTrackerComponent implements OnInit {
  data: PromotionTrackerData | null = null;
  allLevels: PromotionLevel[] = [];
  loading = true;
  error = '';

  windowOptions = [
    { label: '1 Month',   value: 30  },
    { label: '2 Months',  value: 60  },
    { label: '3 Months',  value: 90  },
    { label: '4 Months',  value: 120 },
    { label: '5 Months',  value: 150 },
    { label: '6 Months',  value: 180 },
    { label: '7 Months',  value: 210 },
    { label: '8 Months',  value: 240 },
    { label: '9 Months',  value: 270 },
    { label: '10 Months', value: 300 },
    { label: '11 Months', value: 330 },
    { label: '12 Months', value: 365 }
  ];
  selectedWindow = 30;

  constructor(private promotionService: PromotionService) {}

  ngOnInit(): void {
    this.loadTracker();
  }

  loadTracker(): void {
    this.loading = true;
    this.error = '';
    forkJoin({
      tracker: this.promotionService.getTrackerData(this.selectedWindow),
      levels:  this.promotionService.getLevels()
    }).subscribe({
      next: (res: any) => {
        this.data      = res.tracker.data || res.tracker;
        this.allLevels = (res.levels.data || res.levels).levels || [];
        this.loading   = false;
      },
      error: (err: any) => {
        this.error   = err?.error?.message || 'Failed to load promotion data.';
        this.loading = false;
      }
    });
  }

  onWindowChange(): void { this.loadTracker(); }

  /** Arrow state for Producer Track strip */
  arrowClassProducer(level: PromotionLevel): string {
    if (!this.data) return 'future';
    const currentRank = this.data.currentLevel.rank;
    const nextRank    = this.data.nextLevel?.rank ?? -1;
    if (level.rank < currentRank)   return 'completed';
    if (level.rank === currentRank) return 'current';
    if (level.rank === nextRank)    return this.data.producerMet ? 'next-ready' : 'next-pending';
    return 'future';
  }

  /** Arrow state for Builder Track strip */
  arrowClassBuilder(level: PromotionLevel): string {
    if (!this.data) return 'future';
    const currentRank = this.data.currentLevel.rank;
    const nextRank    = this.data.nextLevel?.rank ?? -1;
    if (level.rank < currentRank)   return 'completed';
    if (level.rank === currentRank) return 'current';
    if (level.rank === nextRank)    return this.data.builderMet ? 'next-ready' : 'next-pending';
    return 'future';
  }

  formatCurrency(amount: number): string {
    return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  formatLevel(name: string): string {
    return name.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  progressColor(pct: number): string {
    if (pct >= 100) return 'success';
    if (pct >= 60)  return 'primary';
    if (pct >= 30)  return 'warning';
    return 'danger';
  }
}
