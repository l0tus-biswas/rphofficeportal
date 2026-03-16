import { Component, OnInit } from '@angular/core';
import { PromotionService, PromotionLevel } from '../../../services/promotion.service';

@Component({
  selector: 'app-promotion-levels',
  templateUrl: './promotion-levels.component.html',
  styleUrls: ['./promotion-levels.component.css']
})
export class PromotionLevelsComponent implements OnInit {
  levels: PromotionLevel[] = [];
  loading = true;
  error = '';
  saving: { [id: string]: boolean } = {};
  saveSuccess: { [id: string]: boolean } = {};
  saveError: { [id: string]: string } = {};

  constructor(private promotionService: PromotionService) {}

  ngOnInit(): void {
    this.loadLevels();
  }

  loadLevels(): void {
    this.loading = true;
    this.error = '';
    this.promotionService.getAdminLevels().subscribe({
      next: (res: any) => {
        this.levels = (res.data || res).levels || [];
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to load promotion levels.';
        this.loading = false;
      }
    });
  }

  saveLevel(level: PromotionLevel): void {
    this.saving[level._id] = true;
    this.saveSuccess[level._id] = false;
    this.saveError[level._id] = '';

    const payload = {
      commissionPercent: level.commissionPercent,
      producerPremiumThreshold: level.producerPremiumThreshold,
      producerWindowDays: level.producerWindowDays,
      builderPremiumThreshold: level.builderPremiumThreshold,
      builderAgentCountThreshold: level.builderAgentCountThreshold,
      builderWindowDays: level.builderWindowDays,
      canSkipTo: level.canSkipTo,
      skipRequirements: level.skipRequirements,
      isActive: level.isActive
    };

    this.promotionService.updateLevel(level._id, payload).subscribe({
      next: (res: any) => {
        const updated = (res.data || res).level;
        if (updated) {
          const idx = this.levels.findIndex(l => l._id === level._id);
          if (idx >= 0) this.levels[idx] = updated;
        }
        this.saving[level._id] = false;
        this.saveSuccess[level._id] = true;
        setTimeout(() => this.saveSuccess[level._id] = false, 2500);
      },
      error: (err) => {
        this.saving[level._id] = false;
        this.saveError[level._id] = err?.error?.message || 'Save failed.';
      }
    });
  }

  formatLevel(name: string): string {
    return name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  hasSkipLevels(): boolean {
    return this.levels.some(l => l.canSkipTo);
  }
}
