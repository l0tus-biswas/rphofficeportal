import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { CarrierService, Carrier, CarrierDocument, isDocumentPreviewable, getDocumentMimeType, getDocumentIcon, normalizeRichText } from '../../../services/carrier.service';

const MAX_DOCUMENT_SIZE_BYTES = 3 * 1024 * 1024;

@Component({
  selector: 'app-carriers',
  templateUrl: './carriers.component.html',
  styleUrls: ['./carriers.component.css']
})
export class CarriersComponent implements OnInit {
  carriers: Carrier[] = [];
  filteredCarriers: Carrier[] = [];
  filterCategory = '';
  sortField: 'name' | 'status' | '' = '';
  sortDirection: 'asc' | 'desc' = 'asc';
  loading = true;
  error = '';
  success = '';

  // Form
  showForm = false;
  editMode = false;
  currentCarrier: Partial<Carrier> = {};
  levelGuideFile: File | null = null;

  // Document library (add-document mini form)
  newDocumentName = '';
  newDocumentFile: File | null = null;
  documentError = '';
  savingDocument = false;

  readonly quillModules = {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      [{ font: [] }],
      [{ size: ['small', false, 'large', 'huge'] }],
      ['bold', 'italic', 'underline'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['link'],
      ['clean']
    ]
  };

  // ngx-quill's default valueGetter reads Quill's getSemanticHTML(), which
  // encodes every literal space as &nbsp; (see normalizeRichText's comment
  // in carrier.service.ts for why that breaks word-wrapping). root.innerHTML
  // is Quill's own live DOM and doesn't have this problem.
  readonly quillValueGetter = (quillEditor: any): string => quillEditor.root.innerHTML;

  readonly CATEGORIES = [
    'Life Insurance',
    'Health Insurance',
    'Medicare',
    'Supplemental Insurance',
    'Annuities'
  ];

  constructor(private carrierService: CarrierService) {}

  ngOnInit(): void {
    this.loadCarriers();
  }

  loadCarriers(): void {
    this.loading = true;
    this.error = '';

    this.carrierService.getAllCarriers(false).subscribe({
      next: (carriers) => {
        for (const c of carriers) {
          c.contractingInstructions = normalizeRichText(c.contractingInstructions);
          c.whatToExpect = normalizeRichText(c.whatToExpect);
          c.notes = normalizeRichText(c.notes);
        }
        this.carriers = carriers;
        this.applyFilter();
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading carriers:', error);
        this.error = 'Failed to load carriers';
        this.loading = false;
      }
    });
  }

  // Plain-text, entity-decoded preview for the Notes table column (e.g.
  // "Lorem&nbsp;ipsum..." -> "Lorem ipsum..."), truncated to a short snippet.
  // A detached element's textContent decodes every HTML entity correctly
  // (not just &nbsp;) using the browser's own parser, rather than a
  // hand-rolled regex that would only cover entities we thought to list.
  toPlainText(html: string | undefined, maxLength = 120): string {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = normalizeRichText(html).replace(/<\/(p|div|li)>|<br\s*\/?>/gi, ' ');
    const text = (div.textContent || '').replace(/\s+/g, ' ').trim();
    return text.length > maxLength ? text.slice(0, maxLength).trim() + '…' : text;
  }

  applyFilter(): void {
    this.filteredCarriers = this.filterCategory
      ? this.carriers.filter(c => c.category && c.category.includes(this.filterCategory))
      : [...this.carriers];
    this.applySort();
  }

  toggleSort(field: 'name' | 'status'): void {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = 'asc';
    }
    this.applySort();
  }

  applySort(): void {
    if (!this.sortField) return;
    const dir = this.sortDirection === 'asc' ? 1 : -1;
    this.filteredCarriers.sort((a, b) => {
      if (this.sortField === 'name') {
        return dir * a.name.localeCompare(b.name);
      }
      if (this.sortField === 'status') {
        return dir * (Number(b.isActive) - Number(a.isActive));
      }
      return 0;
    });
  }

  openNewForm(): void {
    this.showForm = true;
    this.editMode = false;
    this.error = '';
    this.currentCarrier = {
      name: '', category: [], isActive: true, notes: ''
    };
    this.levelGuideFile = null;
    this.resetDocumentForm();
  }

  editCarrier(carrier: Carrier): void {
    this.showForm = true;
    this.editMode = true;
    this.error = '';
    this.currentCarrier = {
      ...carrier,
      category: carrier.category ? [...carrier.category] : [],
      documents: carrier.documents ? [...carrier.documents] : []
    };
    this.levelGuideFile = null;
    this.resetDocumentForm();
  }

  cancelForm(): void {
    this.showForm = false;
    this.editMode = false;
    this.error = '';
    this.currentCarrier = {};
    this.levelGuideFile = null;
    this.resetDocumentForm();
  }

  private resetDocumentForm(): void {
    this.newDocumentName = '';
    this.newDocumentFile = null;
    this.documentError = '';
    this.savingDocument = false;
  }

  toggleCategory(cat: string): void {
    if (!this.currentCarrier.category) this.currentCarrier.category = [];
    const idx = this.currentCarrier.category.indexOf(cat);
    if (idx > -1) {
      this.currentCarrier.category.splice(idx, 1);
    } else {
      this.currentCarrier.category.push(cat);
    }
  }

  isCategorySelected(cat: string): boolean {
    return !!this.currentCarrier.category && this.currentCarrier.category.includes(cat);
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.levelGuideFile = input.files && input.files.length > 0 ? input.files[0] : null;
  }

  onNewDocumentFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.newDocumentFile = input.files && input.files.length > 0 ? input.files[0] : null;
  }

  addDocument(): void {
    this.documentError = '';
    if (!this.currentCarrier._id) { this.documentError = 'Save the carrier before attaching documents'; return; }
    if (!this.newDocumentName.trim()) { this.documentError = 'Document name is required'; return; }
    if (!this.newDocumentFile) { this.documentError = 'Please choose a file'; return; }
    if (this.newDocumentFile.size > MAX_DOCUMENT_SIZE_BYTES) { this.documentError = 'File is too large. Maximum size is 3MB.'; return; }

    this.savingDocument = true;
    this.carrierService.uploadCarrierDocument(this.currentCarrier._id, this.newDocumentName.trim(), this.newDocumentFile).subscribe({
      next: (carrier) => {
        this.currentCarrier.documents = carrier.documents;
        this.newDocumentName = '';
        this.newDocumentFile = null;
        this.savingDocument = false;
        this.loadCarriers();
      },
      error: (error) => {
        this.savingDocument = false;
        this.documentError = error.error?.message || 'Failed to upload document';
      }
    });
  }

  deleteDocument(doc: CarrierDocument): void {
    if (!this.currentCarrier._id || !doc._id) return;
    if (!confirm(`Delete "${doc.name}"? This cannot be undone.`)) return;

    this.carrierService.deleteCarrierDocument(this.currentCarrier._id, doc._id).subscribe({
      next: () => {
        this.currentCarrier.documents = (this.currentCarrier.documents || []).filter(d => d._id !== doc._id);
        this.loadCarriers();
      },
      error: (error) => {
        this.documentError = error.error?.message || 'Failed to delete document';
      }
    });
  }

  viewDocument(doc: CarrierDocument): void {
    if (!this.currentCarrier._id || !doc._id) return;
    const fileName = doc.originalFileName || doc.name;
    this.openOrDownloadBlob(this.carrierService.downloadCarrierDocument(this.currentCarrier._id, doc._id), fileName);
  }

  getDocumentIconClass(doc: CarrierDocument): string {
    return getDocumentIcon(doc.originalFileName || doc.name);
  }

  viewLevelGuide(): void {
    if (!this.currentCarrier._id) return;
    this.openPdfBlob(this.carrierService.downloadLevelGuide(this.currentCarrier._id));
  }

  private openPdfBlob(source: Observable<Blob>): void {
    const win = window.open('', '_blank');
    source.subscribe({
      next: (blob) => {
        const typed = new Blob([blob], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(typed);
        if (win && !win.closed) {
          win.location.href = url;
        }
        setTimeout(() => window.URL.revokeObjectURL(url), 60000);
      },
      error: () => { if (win && !win.closed) win.close(); this.error = 'Failed to open document'; }
    });
  }

  // Documents can be PDF, Word, or images. PDFs/images can be previewed
  // inline in a new tab; Word docs can't be rendered by the browser so
  // those are downloaded instead.
  private openOrDownloadBlob(source: Observable<Blob>, fileName: string): void {
    const type = getDocumentMimeType(fileName);
    if (isDocumentPreviewable(fileName)) {
      const win = window.open('', '_blank');
      source.subscribe({
        next: (blob) => {
          const typed = new Blob([blob], { type });
          const url = window.URL.createObjectURL(typed);
          if (win && !win.closed) win.location.href = url;
          setTimeout(() => window.URL.revokeObjectURL(url), 60000);
        },
        error: () => { if (win && !win.closed) win.close(); this.error = 'Failed to open document'; }
      });
    } else {
      source.subscribe({
        next: (blob) => {
          const typed = new Blob([blob], { type });
          const url = window.URL.createObjectURL(typed);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          a.click();
          setTimeout(() => window.URL.revokeObjectURL(url), 60000);
        },
        error: () => { this.error = 'Failed to download document'; }
      });
    }
  }

  saveCarrier(): void {
    if (!this.currentCarrier.name) { this.error = 'Carrier name is required'; return; }
    if (!this.currentCarrier.category || this.currentCarrier.category.length === 0) { this.error = 'At least one carrier category is required'; return; }

    const formData = new FormData();
    formData.append('name', this.currentCarrier.name);
    formData.append('category', JSON.stringify(this.currentCarrier.category));
    formData.append('isActive', String(this.currentCarrier.isActive ?? true));
    if (this.currentCarrier.contractingLink) formData.append('contractingLink', this.currentCarrier.contractingLink);
    if (this.currentCarrier.contractingInstructions) formData.append('contractingInstructions', normalizeRichText(this.currentCarrier.contractingInstructions));
    if (this.currentCarrier.whatToExpect) formData.append('whatToExpect', normalizeRichText(this.currentCarrier.whatToExpect));
    if (this.currentCarrier.notes !== undefined) formData.append('notes', normalizeRichText(this.currentCarrier.notes));
    if (this.levelGuideFile) formData.append('levelGuideFile', this.levelGuideFile);

    const op = this.editMode && this.currentCarrier._id
      ? this.carrierService.updateCarrier(this.currentCarrier._id, formData)
      : this.carrierService.createCarrier(formData);

    op.subscribe({
      next: () => {
        this.success = this.editMode ? 'Carrier updated successfully' : 'Carrier added successfully';
        this.cancelForm();
        this.loadCarriers();
        setTimeout(() => this.success = '', 4000);
      },
      error: (error) => {
        console.error('Error saving carrier:', error);
        this.error = error.error?.message || 'Failed to save carrier';
      }
    });
  }

  deleteCarrier(id: string | undefined): void {
    if (!id) { this.error = 'Invalid carrier ID'; return; }
    if (!confirm('Are you sure you want to delete this carrier? This will mark it as inactive.')) return;

    this.carrierService.deleteCarrier(id).subscribe({
      next: () => {
        this.success = 'Carrier deleted successfully';
        this.loadCarriers();
        setTimeout(() => this.success = '', 3000);
      },
      error: (error) => {
        console.error('Error deleting carrier:', error);
        this.error = error.error?.message || 'Failed to delete carrier';
      }
    });
  }

}
