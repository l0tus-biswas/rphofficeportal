import { Component, OnInit } from '@angular/core';
import { AcaService, AcaBatch, AcaUploadResult } from '../../../services/aca.service';

@Component({
  selector: 'app-aca-management',
  templateUrl: './aca-management.component.html',
  styleUrls: ['./aca-management.component.css']
})
export class AcaManagementComponent implements OnInit {
  // Upload state
  selectedFile: File | null = null;
  uploadBatchInput = '';
  uploading = false;
  uploadResult: AcaUploadResult | null = null;
  uploadError = '';

  // Batch history state
  batches: AcaBatch[] = [];
  batchesLoading = true;
  batchesError = '';

  // Drill-down on a batch
  selectedBatch: string | null = null;
  batchRecords: any[] = [];
  batchRecordsLoading = false;

  constructor(private acaService: AcaService) {}

  ngOnInit(): void {
    this.loadBatches();
  }

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

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
      this.uploadResult = null;
      this.uploadError = '';
    }
  }

  upload(): void {
    if (!this.selectedFile) {
      this.uploadError = 'Please select a CSV file.';
      return;
    }
    const formData = new FormData();
    formData.append('file', this.selectedFile);
    if (this.uploadBatchInput.trim()) {
      formData.append('uploadBatch', this.uploadBatchInput.trim());
    }

    this.uploading = true;
    this.uploadResult = null;
    this.uploadError = '';

    this.acaService.uploadCsv(formData).subscribe({
      next: (res) => {
        this.uploadResult = res as any;
        this.uploading = false;
        this.selectedFile = null;
        // Reset the file input
        const input = document.getElementById('csvFileInput') as HTMLInputElement;
        if (input) input.value = '';
        this.loadBatches();
      },
      error: (err) => {
        this.uploadError = err?.error?.message || 'Upload failed. Please try again.';
        this.uploading = false;
      }
    });
  }

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

  formatBatch(batch: string): string {
    const match = batch.match(/^(\d{4})-(\d{2})$/);
    if (match) {
      const d = new Date(parseInt(match[1]), parseInt(match[2]) - 1, 1);
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
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
