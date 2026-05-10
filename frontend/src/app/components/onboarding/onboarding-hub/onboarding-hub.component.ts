import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../../services/auth.service';
import { OnboardingHubService, OnboardingDocType, OnboardingDocument } from '../../../services/onboarding-hub.service';
import { environment } from '../../../../environments/environment';

interface DocCard {
  docType: OnboardingDocType;
  document: OnboardingDocument | null;
}

@Component({
  selector: 'app-onboarding-hub',
  templateUrl: './onboarding-hub.component.html',
  styleUrls: ['./onboarding-hub.component.css']
})
export class OnboardingHubComponent implements OnInit {
  docCards: DocCard[] = [];
  loading = true;
  error = '';
  success = '';

  uploadingDocTypeId = '';
  deletingDocId = '';
  selectedFiles: { [docTypeId: string]: File } = {};
  uploadNotes: { [docTypeId: string]: string } = {};

  currentUser: any;

  constructor(
    private onboardingHubService: OnboardingHubService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.error = '';

    let typesLoaded = false;
    let docsLoaded = false;
    let docTypes: OnboardingDocType[] = [];
    let documents: OnboardingDocument[] = [];

    const buildCards = () => {
      const docMap: { [docTypeId: string]: OnboardingDocument } = {};
      for (const doc of documents) {
        const typeId = typeof doc.docType === 'object' ? (doc.docType as OnboardingDocType)._id! : doc.docType as string;
        // Keep first occurrence only (API returns newest first)
        if (!docMap[typeId]) {
          docMap[typeId] = doc;
        }
      }
      this.docCards = docTypes.map(dt => ({
        docType: dt,
        document: dt._id ? (docMap[dt._id] || null) : null
      }));
      this.loading = false;
    };

    const checkDone = () => { if (typesLoaded && docsLoaded) buildCards(); };

    this.onboardingHubService.getDocTypes().subscribe({
      next: (types) => { docTypes = types; typesLoaded = true; checkDone(); },
      error: () => { this.error = 'Failed to load document types'; this.loading = false; }
    });

    if (this.currentUser?._id) {
      this.onboardingHubService.getDocuments(this.currentUser._id).subscribe({
        next: (docs) => { documents = docs; docsLoaded = true; checkDone(); },
        error: () => { docsLoaded = true; checkDone(); }
      });
    } else {
      docsLoaded = true;
    }
  }

  onFileSelected(event: Event, docTypeId: string): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.selectedFiles[docTypeId] = input.files[0];
    }
  }

  uploadDocument(docType: OnboardingDocType): void {
    if (!docType._id) return;
    const file = this.selectedFiles[docType._id];
    if (!file) { this.error = 'Please select a file first'; return; }

    this.uploadingDocTypeId = docType._id;
    this.error = '';

    const formData = new FormData();
    formData.append('docTypeId', docType._id);
    formData.append('docFile', file);
    if (this.uploadNotes[docType._id]) {
      formData.append('notes', this.uploadNotes[docType._id]);
    }

    this.onboardingHubService.uploadDocument(formData).subscribe({
      next: () => {
        this.success = `${docType.name} uploaded successfully`;
        this.uploadingDocTypeId = '';
        delete this.selectedFiles[docType._id!];
        delete this.uploadNotes[docType._id!];
        this.loadData();
        setTimeout(() => this.success = '', 4000);
      },
      error: (err) => {
        this.error = err.error?.message || `Failed to upload ${docType.name}`;
        this.uploadingDocTypeId = '';
      }
    });
  }

  deleteDocument(card: DocCard): void {
    if (!card.document?._id) return;
    if (!confirm(`Remove your ${card.docType.name} document?`)) return;

    this.deletingDocId = card.document._id;
    this.onboardingHubService.deleteDocument(card.document._id).subscribe({
      next: () => {
        this.success = `${card.docType.name} removed`;
        this.deletingDocId = '';
        this.loadData();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to remove document';
        this.deletingDocId = '';
      }
    });
  }

  viewExternalLink(url: string): void {
    window.open(url, '_blank');
  }

  getFileUrl(filePath: string): string {
    return `${environment.apiUrl.replace('/api', '')}/${filePath}`;
  }

  get completedCount(): number {
    return this.docCards.filter(c => !!c.document).length;
  }

  get requiredCount(): number {
    return this.docCards.filter(c => c.docType.required).length;
  }

  get completedRequiredCount(): number {
    return this.docCards.filter(c => c.docType.required && !!c.document).length;
  }
}
