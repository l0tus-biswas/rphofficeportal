import { Component, OnInit } from '@angular/core';
import { AcaService, AcaBatch, AcaUploadResult, TierEntry, AcaTierOverride } from '../../../services/aca.service';

@Component({
  selector: 'app-aca-management',
  templateUrl: './aca-management.component.html',
  styleUrls: ['./aca-management.component.css']
})
export class AcaManagementComponent implements OnInit {
  // ── Upload state ──
  selectedFiles: File[] = [];
  uploadBatchInput = '';
  uploadNotes = '';
  replaceBatch = false;
  uploading = false;
  uploadResult: AcaUploadResult | null = null;
  uploadError = '';

  // ── Batch history state ──
  batches: AcaBatch[] = [];
  batchesLoading = true;
  batchesError = '';

  // ── Batch drill-down ──
  selectedBatch: string | null = null;
  batchRecords: any[] = [];
  batchRecordsLoading = false;

  // ── Delete batch ──
  deletingBatch: string | null = null;
  confirmDeleteBatch: string | null = null;

  // ── Tier configuration (5.12) ──
  activeTab: 'upload' | 'tiers' = 'upload';
  tiers: TierEntry[] = [];
  tiersLoading = false;
  tiersSaving = false;
  tiersError = '';
  tiersSuccess = '';

  // ── Agent tier overrides (5.13) ──
  agentOverrides: AcaTierOverride[] = [];
  overridesLoading = false;
  showOverrideModal = false;
  overrideAgentId = '';
  overrideTiers: TierEntry[] = [];
  overrideSaving = false;
  overrideError = '';

  constructor(private acaService: AcaService) {}

  ngOnInit(): void {
    this.loadBatches();
    this.loadTierConfig();
  }

  // ── Batch loading ──
  loadBatches(): void {
    this.batchesLoading = true;
    this.batchesError = '';
    this.acaService.getBatches().subscribe({
      next: (res) => {
        this.batches = (res as any).batches || [];
        this.batchesLoading = false;
      },
      error: (err) => {
        this.batchesError = err?.error?.message || 'Failed to load batch history.';
        this.batchesLoading = false;
      }
    });
  }

  // ── File selection (multi-file, CSV + XLSX) ──
  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFiles = Array.from(input.files);
      this.uploadResult = null;
      this.uploadError = '';
    }
  }

  removeFile(index: number): void {
    this.selectedFiles.splice(index, 1);
  }

  // ── Upload ──
  upload(): void {
    if (this.selectedFiles.length === 0) {
      this.uploadError = 'Please select at least one CSV or Excel file.';
      return;
    }
    const formData = new FormData();
    for (const file of this.selectedFiles) {
      formData.append('files', file);
    }
    if (this.uploadBatchInput.trim()) {
      formData.append('uploadBatch', this.toBackendBatch(this.uploadBatchInput.trim()));
    }
    if (this.replaceBatch) {
      formData.append('replaceBatch', 'true');
    }
    if (this.uploadNotes.trim()) {
      formData.append('notes', this.uploadNotes.trim());
    }

    this.uploading = true;
    this.uploadResult = null;
    this.uploadError = '';

    this.acaService.uploadFiles(formData).subscribe({
      next: (res) => {
        this.uploadResult = res as any;
        this.uploading = false;
        this.selectedFiles = [];
        this.replaceBatch = false;
        this.uploadNotes = '';
        const input = document.getElementById('fileInput') as HTMLInputElement;
        if (input) input.value = '';
        this.loadBatches();
      },
      error: (err) => {
        this.uploadError = err?.error?.message || 'Upload failed. Please try again.';
        this.uploading = false;
      }
    });
  }

  // ── Batch drill-down ──
  viewBatchRecords(batch: string): void {
    this.selectedBatch = batch;
    this.batchRecords = [];
    this.batchRecordsLoading = true;
    this.acaService.getBatchRecords(batch).subscribe({
      next: (res) => {
        this.batchRecords = (res as any).records || [];
        this.batchRecordsLoading = false;
      },
      error: () => {
        this.batchRecordsLoading = false;
      }
    });
  }

  closeBatchDetail(): void {
    this.selectedBatch = null;
    this.batchRecords = [];
  }

  // ── Delete batch (5.3) ──
  confirmDelete(batch: string): void {
    this.confirmDeleteBatch = batch;
  }

  cancelDelete(): void {
    this.confirmDeleteBatch = null;
  }

  deleteBatchConfirmed(): void {
    if (!this.confirmDeleteBatch) return;
    const batch = this.confirmDeleteBatch;
    this.deletingBatch = batch;
    this.confirmDeleteBatch = null;
    this.acaService.deleteBatch(batch).subscribe({
      next: () => {
        this.deletingBatch = null;
        if (this.selectedBatch === batch) {
          this.closeBatchDetail();
        }
        this.loadBatches();
      },
      error: () => {
        this.deletingBatch = null;
      }
    });
  }

  // ── Format helpers ──
  formatBatch(batch: string): string {
    // Handle YYYY-MM (backend storage format)
    const matchYM = batch.match(/^(\d{4})-(\d{2})$/);
    if (matchYM) {
      const d = new Date(parseInt(matchYM[1]), parseInt(matchYM[2]) - 1, 1);
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    // Handle MM-YYYY (user input format)
    const matchMY = batch.match(/^(\d{2})-(\d{4})$/);
    if (matchMY) {
      const d = new Date(parseInt(matchMY[2]), parseInt(matchMY[1]) - 1, 1);
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    return batch;
  }

  downloadSampleCsv(): void {
    this.acaService.downloadSampleCsv().subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'aca-sample.csv';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => {
        this.uploadError = 'Failed to download sample CSV.';
      }
    });
  }

  get defaultBatchPlaceholder(): string {
    const now = new Date();
    return `${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
  }

  /** Convert MM-YYYY to YYYY-MM for backend storage */
  private toBackendBatch(input: string): string {
    const match = input.match(/^(\d{2})-(\d{4})$/);
    if (match) return `${match[2]}-${match[1]}`;
    return input; // pass through if already YYYY-MM or other format
  }

  get selectedFileNames(): string {
    return this.selectedFiles.map(f => f.name).join(', ');
  }

  // ── Tier config (5.12) ──
  loadTierConfig(): void {
    this.tiersLoading = true;
    this.acaService.getTierConfig().subscribe({
      next: (res: any) => {
        this.tiers = res.tiers || [];
        this.tiersLoading = false;
        this.loadAgentOverrides();
      },
      error: () => {
        // Use defaults if no config yet
        this.tiers = [
          { tier: 0, label: 'Tier 0', threshold: 0, rate: 0 },
          { tier: 1, label: 'Tier 1', threshold: 1000, rate: 1 },
          { tier: 2, label: 'Tier 2', threshold: 2000, rate: 2 },
          { tier: 3, label: 'Tier 3', threshold: 3000, rate: 3 }
        ];
        this.tiersLoading = false;
      }
    });
  }

  addTier(): void {
    const maxTier = this.tiers.length > 0 ? Math.max(...this.tiers.map(t => t.tier)) + 1 : 0;
    this.tiers.push({ tier: maxTier, label: `Tier ${maxTier}`, threshold: 0, rate: 0 });
  }

  removeTier(index: number): void {
    if (this.tiers.length > 1) {
      this.tiers.splice(index, 1);
    }
  }

  saveTiers(): void {
    this.tiersSaving = true;
    this.tiersError = '';
    this.tiersSuccess = '';
    this.acaService.updateTierConfig(this.tiers).subscribe({
      next: (res: any) => {
        this.tiers = res.tiers || this.tiers;
        this.tiersSuccess = 'Tier configuration saved successfully.';
        this.tiersSaving = false;
        setTimeout(() => this.tiersSuccess = '', 3000);
      },
      error: (err) => {
        this.tiersError = err?.error?.message || 'Failed to save tier configuration.';
        this.tiersSaving = false;
      }
    });
  }

  // ── Agent tier overrides (5.13) ──
  loadAgentOverrides(): void {
    this.overridesLoading = true;
    this.acaService.getAgentTierOverrides().subscribe({
      next: (res: any) => {
        this.agentOverrides = res.overrides || [];
        this.overridesLoading = false;
      },
      error: () => {
        this.overridesLoading = false;
      }
    });
  }

  openOverrideModal(override?: AcaTierOverride): void {
    this.showOverrideModal = true;
    this.overrideError = '';
    if (override) {
      this.overrideAgentId = override.agent._id;
      this.overrideTiers = JSON.parse(JSON.stringify(override.tiers));
    } else {
      this.overrideAgentId = '';
      this.overrideTiers = JSON.parse(JSON.stringify(this.tiers));
    }
  }

  closeOverrideModal(): void {
    this.showOverrideModal = false;
    this.overrideAgentId = '';
    this.overrideTiers = [];
    this.overrideError = '';
  }

  saveOverride(): void {
    if (!this.overrideAgentId.trim()) {
      this.overrideError = 'Please enter an Agent ID.';
      return;
    }
    this.overrideSaving = true;
    this.overrideError = '';
    this.acaService.setAgentTierOverride(this.overrideAgentId.trim(), this.overrideTiers).subscribe({
      next: () => {
        this.overrideSaving = false;
        this.closeOverrideModal();
        this.loadAgentOverrides();
      },
      error: (err) => {
        this.overrideError = err?.error?.message || 'Failed to save override.';
        this.overrideSaving = false;
      }
    });
  }

  removeOverride(agentId: string): void {
    this.acaService.removeAgentTierOverride(agentId).subscribe({
      next: () => this.loadAgentOverrides(),
      error: () => {}
    });
  }
}
