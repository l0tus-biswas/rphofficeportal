import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../../services/auth.service';
import { OnboardingHubService, OnboardingDocType, OnboardingDocument } from '../../../services/onboarding-hub.service';
import { DocumentHubService, DocRequest } from '../../../services/document-hub.service';
import { environment } from '../../../../environments/environment';

interface DocCard {
  docType: OnboardingDocType;
  document: OnboardingDocument | null;
}

interface DirectDepositEntry {
  routingNumber: string;
  accountNumber: string;
  confirmAccountNumber: string;
  accountType: string;
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
  directDepositData: { [docTypeId: string]: DirectDepositEntry } = {};
  showHistory: { [docTypeId: string]: boolean } = {};

  currentUser: any;
  pendingRequests: DocRequest[] = [];

  // Request response inline upload state
  requestUploadOpen: { [requestId: string]: boolean } = {};
  requestFiles: { [requestId: string]: File } = {};
  requestUploadNotes: { [requestId: string]: string } = {};
  submittingRequest: { [requestId: string]: boolean } = {};

  constructor(
    private onboardingHubService: OnboardingHubService,
    private documentHubService: DocumentHubService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadData();
    this.loadPendingRequests();
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
      // Initialize directDepositData for doc types that need it
      for (const dt of docTypes) {
        if (dt.hasDirectDepositFields && dt._id && !this.directDepositData[dt._id]) {
          this.directDepositData[dt._id] = {
            routingNumber: '',
            accountNumber: '',
            confirmAccountNumber: '',
            accountType: ''
          };
        }
      }
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

    // Validate Direct Deposit fields
    if (docType.hasDirectDepositFields) {
      const dd = this.directDepositData[docType._id];
      if (!dd || !dd.routingNumber || !dd.accountNumber || !dd.accountType) {
        this.error = 'Please fill in all banking information fields';
        return;
      }
      if (!/^\d{9}$/.test(dd.routingNumber)) {
        this.error = 'Routing number must be exactly 9 digits';
        return;
      }
      if (dd.accountNumber !== dd.confirmAccountNumber) {
        this.error = 'Account numbers do not match';
        return;
      }
    }

    this.uploadingDocTypeId = docType._id;
    this.error = '';

    const formData = new FormData();
    formData.append('docTypeId', docType._id);
    formData.append('docFile', file);
    if (this.uploadNotes[docType._id]) {
      formData.append('notes', this.uploadNotes[docType._id]);
    }
    // Append Direct Deposit fields if applicable
    if (docType.hasDirectDepositFields) {
      const dd = this.directDepositData[docType._id];
      formData.append('routingNumber', dd.routingNumber);
      formData.append('accountNumber', dd.accountNumber);
      formData.append('accountType', dd.accountType);
    }

    this.onboardingHubService.uploadDocument(formData).subscribe({
      next: () => {
        this.success = `${docType.name} uploaded successfully`;
        this.uploadingDocTypeId = '';
        delete this.selectedFiles[docType._id!];
        delete this.uploadNotes[docType._id!];
        if (docType.hasDirectDepositFields && docType._id) {
          this.directDepositData[docType._id] = {
            routingNumber: '',
            accountNumber: '',
            confirmAccountNumber: '',
            accountType: ''
          };
        }
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

  formatReviewDate(date: any): string {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  }

  toggleHistory(docTypeId: string): void {
    this.showHistory[docTypeId] = !this.showHistory[docTypeId];
  }

  get completedCount(): number {
    return this.docCards.filter(c => !!c.document).length;
  }

  get requiredCount(): number {
    return this.docCards.filter(c => c.docType.required).length;
  }

  get completedRequiredCount(): number {
    return this.docCards.filter(c => c.docType.required && c.document?.status === 'approved').length;
  }

  get submittedRequiredCount(): number {
    return this.docCards.filter(c => c.docType.required && !!c.document).length;
  }

  loadPendingRequests(): void {
    this.documentHubService.getRequests().subscribe({
      next: (res: any) => {
        const userId = this.currentUser?._id;
        this.pendingRequests = (res.requests || []).filter((r: DocRequest) => {
          if (r.isActive === false) return false;
          // Only show requests where this agent's response is still 'pending'
          if (userId && r.responses) {
            const myResponse = r.responses.find((resp: any) => {
              const agentId = typeof resp.agent === 'object' ? resp.agent._id : resp.agent;
              return agentId === userId;
            });
            if (myResponse && myResponse.status !== 'pending') return false;
          }
          return true;
        });
      },
      error: () => {}
    });
  }

  toggleRequestUpload(requestId: string): void {
    this.requestUploadOpen[requestId] = !this.requestUploadOpen[requestId];
  }

  onRequestFileSelected(event: Event, requestId: string): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.requestFiles[requestId] = input.files[0];
    }
  }

  submitRequestResponse(request: DocRequest): void {
    const reqId = request._id;
    if (!reqId) return;
    const file = this.requestFiles[reqId];
    if (!file) return;

    this.submittingRequest[reqId] = true;
    const notes = this.requestUploadNotes[reqId] || '';

    this.documentHubService.respondToRequest(reqId, file, notes).subscribe({
      next: () => {
        this.success = `Response submitted for "${request.title}"`;
        this.submittingRequest[reqId] = false;
        this.requestUploadOpen[reqId] = false;
        delete this.requestFiles[reqId];
        delete this.requestUploadNotes[reqId];
        this.loadPendingRequests();
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to submit response';
        this.submittingRequest[reqId] = false;
      }
    });
  }

  isOverdue(dueDate: string): boolean {
    return new Date(dueDate) < new Date();
  }
}
