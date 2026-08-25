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
  success = '';

  // Modal state (shared for add/edit)
  showAddModal = false;
  showEditModal = false;
  showAdvanced = false;
  editingLevel: Partial<PromotionLevel> = {};
  editingLevelId = '';
  modalLoading = false;
  modalError = '';

  // Delete state
  deleting: { [id: string]: boolean } = {};

  // Legacy compatibility
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

  // --- Add Level ---
  openAddModal(): void {
    const nextRank = this.levels.length > 0
      ? Math.max(...this.levels.map(l => l.rank)) + 1
      : 1;
    this.showAdvanced = false;
    this.editingLevel = {
      name: '',
      rank: nextRank,
      commissionPercent: 0,
      producerPremiumThreshold: 0,
      producerWindowDays: 30,
      producerIncomeThreshold: 0,
      producerIncomeWindowDays: 180,
      builderPremiumThreshold: 0,
      builderAgentCountThreshold: 0,
      builderWindowDays: 60,
      builderRequiredRanks: [],
      builderIncomeThreshold: 0,
      builderIncomeWindowDays: 180,
      canSkipTo: false,
      skipMultiplier: 1.4,
      skipLegCapPercent: 50,
      isActive: true
    };
    this.editingLevelId = '';
    this.modalError = '';
    this.showAddModal = true;
    this.showEditModal = false;
  }

  // --- Edit Level ---
  openEditModal(level: PromotionLevel): void {
    this.editingLevel = {
      ...level,
      skipMultiplier: level.skipMultiplier || 1.4,
      skipLegCapPercent: level.skipLegCapPercent || 50,
      builderRequiredRanks: (level.builderRequiredRanks || []).map(r => ({ ...r }))
    };
    this.editingLevelId = level._id;
    this.modalError = '';
    this.showAdvanced = true;
    this.showEditModal = true;
    this.showAddModal = false;
  }

  // --- Team composition (rank requirement) rows ---
  addRankRequirement(): void {
    if (!this.editingLevel.builderRequiredRanks) this.editingLevel.builderRequiredRanks = [];
    this.editingLevel.builderRequiredRanks.push({ rank: '', count: 1 });
  }

  removeRankRequirement(index: number): void {
    this.editingLevel.builderRequiredRanks?.splice(index, 1);
  }

  /** Levels a rank requirement could reference — any level below the one being edited */
  get availableRankOptions(): PromotionLevel[] {
    const currentRank = this.editingLevel.rank;
    if (currentRank == null) return this.levels;
    return this.levels.filter(l => l.rank < currentRank);
  }

  onSkipToggle(): void {
    if (this.editingLevel.canSkipTo) {
      if (!this.editingLevel.skipMultiplier) this.editingLevel.skipMultiplier = 1.4;
      if (!this.editingLevel.skipLegCapPercent) this.editingLevel.skipLegCapPercent = 50;
    }
  }

  closeModal(): void {
    this.showAddModal = false;
    this.showEditModal = false;
    this.modalError = '';
    this.modalLoading = false;
  }

  submitModal(): void {
    if (!this.editingLevel.name?.trim()) {
      this.modalError = 'Level name is required.';
      return;
    }
    this.modalLoading = true;
    this.modalError = '';

    if (this.showEditModal && this.editingLevelId) {
      // Update existing
      this.promotionService.updateLevel(this.editingLevelId, this.editingLevel).subscribe({
        next: () => {
          this.modalLoading = false;
          this.closeModal();
          this.success = 'Promotion level updated successfully.';
          setTimeout(() => this.success = '', 3000);
          this.loadLevels();
        },
        error: (err) => {
          this.modalLoading = false;
          this.modalError = err?.error?.message || err?.error?.data?.message || 'Failed to update level.';
        }
      });
    } else {
      // Create new
      this.promotionService.createLevel(this.editingLevel).subscribe({
        next: () => {
          this.modalLoading = false;
          this.closeModal();
          this.success = 'Promotion level created successfully.';
          setTimeout(() => this.success = '', 3000);
          this.loadLevels();
        },
        error: (err) => {
          this.modalLoading = false;
          this.modalError = err?.error?.message || err?.error?.data?.message || 'Failed to create level.';
        }
      });
    }
  }

  // --- Delete Level ---
  deleteLevel(level: PromotionLevel): void {
    if (!confirm(`Are you sure you want to delete "${this.formatLevel(level.name)}"?\n\nThis cannot be undone.`)) {
      return;
    }
    this.deleting[level._id] = true;

    this.promotionService.deleteLevel(level._id).subscribe({
      next: (res: any) => {
        this.deleting[level._id] = false;
        this.success = (res.data || res).message || 'Level deleted.';
        setTimeout(() => this.success = '', 3000);
        this.loadLevels();
      },
      error: (err) => {
        this.deleting[level._id] = false;
        this.error = err?.error?.message || err?.error?.data?.message || 'Failed to delete level.';
        setTimeout(() => this.error = '', 5000);
      }
    });
  }

  // --- Reorder ---
  moveUp(index: number): void {
    if (index <= 0) return;
    this.swapAndReorder(index, index - 1);
  }

  moveDown(index: number): void {
    if (index >= this.levels.length - 1) return;
    this.swapAndReorder(index, index + 1);
  }

  private swapAndReorder(fromIdx: number, toIdx: number): void {
    const temp = this.levels[fromIdx];
    this.levels[fromIdx] = this.levels[toIdx];
    this.levels[toIdx] = temp;

    const order = this.levels.map((l, i) => ({ id: l._id, rank: i + 1 }));
    this.promotionService.reorderLevels(order).subscribe({
      next: (res: any) => {
        this.levels = (res.data || res).levels || this.levels;
      },
      error: () => {
        this.loadLevels();
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
