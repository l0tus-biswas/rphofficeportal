import { Component, OnInit } from '@angular/core';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { DocumentHubService, DocFolder, DocHubFile, DocRequest } from '../../services/document-hub.service';
import { AuthService } from '../../services/auth.service';
import { AdminService } from '../../services/admin.service';
import { User } from '../../models/user.model';

@Component({
  selector: 'app-document-hub',
  templateUrl: './document-hub.component.html',
  styleUrls: ['./document-hub.component.css']
})
export class DocumentHubComponent implements OnInit {
  isAdmin = false;
  loading = true;
  error = '';
  success = '';

  // Folder tree
  allFolders: DocFolder[] = [];
  currentFolderId: string | null = null;
  breadcrumb: DocFolder[] = [];

  // Files in current folder
  files: DocHubFile[] = [];
  filesLoading = false;

  // Subfolders in current view
  get subfolders(): DocFolder[] {
    return this.allFolders.filter(f => {
      const parentId = f.parent ? String(f.parent) : null;
      return parentId === this.currentFolderId && f.isActive !== false;
    });
  }

  // Search
  searchQuery = '';

  // Admin: Create/edit folder modal
  showFolderForm = false;
  editingFolder: Partial<DocFolder> = {};
  folderEditMode = false;
  folderSaving = false;

  // Flat list of folder paths for dropdowns
  get folderPathOptions(): { _id: string; path: string }[] {
    const folderMap = new Map(this.allFolders.map(f => [String(f._id), f]));
    const getPath = (folderId: string): string => {
      const parts: string[] = [];
      let current: string | null = folderId;
      while (current) {
        const folder = folderMap.get(current);
        if (!folder) break;
        parts.unshift(folder.name);
        current = folder.parent ? String(folder.parent) : null;
      }
      return parts.join(' / ');
    };
    return this.allFolders
      .filter(f => f.isActive !== false && f._id)
      .map(f => ({ _id: String(f._id), path: getPath(String(f._id)) }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  // Admin: Upload files
  showUploadForm = false;
  uploadFiles: File[] = [];
  uploadName = '';
  uploadDescription = '';
  uploadNotes = '';
  uploadVisibility: 'all' | 'admin' | 'restricted' = 'all';
  uploadRestrictedTo: string[] = [];
  uploading = false;

  // Admin: Edit file
  showFileEditForm = false;
  editingFile: Partial<DocHubFile> = {};
  editRestrictedTo: string[] = [];
  fileEditSaving = false;

  // Document requests
  requests: DocRequest[] = [];
  showRequestForm = false;
  requestForm = { title: '', description: '', dueDate: '', requestedFrom: [] as string[], saveToFolder: null as string | null };
  requestSaving = false;
  agents: User[] = [];
  agentSearch = '';

  // Agent: respond to request
  respondingRequestId = '';
  responseFile: File | null = null;
  responseNotes = '';

  constructor(
    private docHubService: DocumentHubService,
    private authService: AuthService,
    private adminService: AdminService
  ) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    this.isAdmin = user?.role === 'admin';
    this.loadFolders();
    this.loadFiles();
    this.loadRequests();
    if (this.isAdmin) {
      this.adminService.getAllAgents().subscribe({
        next: (res: any) => this.agents = res.users || res || [],
        error: () => {}
      });
    }
  }

  // --- Navigation ---
  loadFolders(): void {
    this.docHubService.getFolders(this.isAdmin).subscribe({
      next: (folders) => { this.allFolders = folders; this.loading = false; },
      error: () => { this.error = 'Failed to load folders'; this.loading = false; }
    });
  }

  loadFiles(): void {
    this.filesLoading = true;
    const search = this.searchQuery.trim() || undefined;
    this.docHubService.getFiles(this.currentFolderId, search).subscribe({
      next: (files) => { this.files = files; this.filesLoading = false; },
      error: () => { this.filesLoading = false; }
    });
  }

  navigateToFolder(folderId: string | null): void {
    this.currentFolderId = folderId ? String(folderId) : null;
    this.searchQuery = '';
    this.buildBreadcrumb();
    this.loadFiles();
  }

  buildBreadcrumb(): void {
    this.breadcrumb = [];
    let current = this.currentFolderId;
    const folderMap = new Map(this.allFolders.map(f => [String(f._id), f]));
    while (current) {
      const folder = folderMap.get(current);
      if (!folder) break;
      this.breadcrumb.unshift(folder);
      current = folder.parent ? String(folder.parent) : null;
    }
  }

  onSearch(): void {
    this.loadFiles();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.loadFiles();
  }

  // --- File actions ---
  openFile(file: DocHubFile): void {
    this.docHubService.downloadFile(file._id!).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');
      },
      error: () => { this.error = 'Failed to open file'; }
    });
  }

  downloadFile(file: DocHubFile): void {
    this.docHubService.downloadFile(file._id!).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.originalFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: () => { this.error = 'Failed to download file'; }
    });
  }

  deleteFile(file: DocHubFile): void {
    if (!confirm(`Delete "${file.name}"? This cannot be undone.`)) return;
    this.docHubService.deleteFile(file._id!).subscribe({
      next: () => {
        this.success = 'File deleted';
        this.loadFiles();
        setTimeout(() => this.success = '', 3000);
      },
      error: () => { this.error = 'Failed to delete file'; }
    });
  }

  openFileEdit(file: DocHubFile): void {
    this.editingFile = { ...file, folder: file.folder?._id || file.folder || null };
    this.editRestrictedTo = (file.restrictedTo || []).map((u: any) => u._id || u);
    this.showFileEditForm = true;
  }

  saveFileEdit(): void {
    if (!this.editingFile._id) return;
    this.fileEditSaving = true;
    const payload: any = { ...this.editingFile };
    if (payload.visibility === 'restricted') {
      payload.restrictedTo = this.editRestrictedTo;
    } else {
      payload.restrictedTo = [];
    }
    this.docHubService.updateFile(this.editingFile._id, payload).subscribe({
      next: () => {
        this.success = 'File updated';
        this.showFileEditForm = false;
        this.fileEditSaving = false;
        this.loadFiles();
        setTimeout(() => this.success = '', 3000);
      },
      error: () => { this.fileEditSaving = false; this.error = 'Failed to update file'; }
    });
  }

  // --- Admin: Folder CRUD ---
  openNewFolder(): void {
    const nextOrder = this.subfolders.length;
    this.editingFolder = { name: '', description: '', parent: this.currentFolderId, sortOrder: nextOrder, visibility: 'all' };
    this.folderEditMode = false;
    this.showFolderForm = true;
  }

  openEditFolder(folder: DocFolder): void {
    this.editingFolder = { ...folder };
    this.folderEditMode = true;
    this.showFolderForm = true;
  }

  saveFolder(): void {
    if (!this.editingFolder.name?.trim()) { this.error = 'Folder name is required'; return; }
    this.folderSaving = true;
    const obs = this.folderEditMode && this.editingFolder._id
      ? this.docHubService.updateFolder(this.editingFolder._id, this.editingFolder)
      : this.docHubService.createFolder(this.editingFolder);
    obs.subscribe({
      next: () => {
        this.success = `Folder ${this.folderEditMode ? 'updated' : 'created'}`;
        this.showFolderForm = false;
        this.folderSaving = false;
        this.loadFolders();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err: any) => { this.folderSaving = false; this.error = err.error?.message || 'Failed to save folder'; }
    });
  }

  deleteFolder(folder: DocFolder): void {
    if (!confirm(`Delete folder "${folder.name}"? Contents will be moved to the parent folder.`)) return;
    this.docHubService.deleteFolder(folder._id!).subscribe({
      next: () => {
        this.success = 'Folder deleted';
        this.loadFolders();
        this.loadFiles();
        setTimeout(() => this.success = '', 3000);
      },
      error: () => { this.error = 'Failed to delete folder'; }
    });
  }

  // --- Admin: Upload ---
  openUploadForm(): void {
    this.uploadFiles = [];
    this.uploadName = '';
    this.uploadDescription = '';
    this.uploadNotes = '';
    this.uploadVisibility = 'all';
    this.uploadRestrictedTo = [];
    this.showUploadForm = true;
  }

  onUploadFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.uploadFiles = Array.from(input.files);
    }
  }

  submitUpload(): void {
    if (this.uploadFiles.length === 0) { this.error = 'Select at least one file'; return; }
    this.uploading = true;
    const formData = new FormData();
    this.uploadFiles.forEach(f => formData.append('files', f));
    if (this.currentFolderId) formData.append('folder', this.currentFolderId);
    if (this.uploadName) formData.append('name', this.uploadName);
    formData.append('description', this.uploadDescription);
    formData.append('notes', this.uploadNotes);
    formData.append('visibility', this.uploadVisibility);
    if (this.uploadVisibility === 'restricted' && this.uploadRestrictedTo.length > 0) {
      formData.append('restrictedTo', JSON.stringify(this.uploadRestrictedTo));
    }

    this.docHubService.uploadFiles(formData).subscribe({
      next: (res: any) => {
        this.success = res.message || 'Files uploaded';
        this.showUploadForm = false;
        this.uploading = false;
        this.loadFiles();
        setTimeout(() => this.success = '', 3000);
      },
      error: () => { this.uploading = false; this.error = 'Failed to upload files'; }
    });
  }

  // --- Document Requests ---
  loadRequests(): void {
    this.docHubService.getRequests().subscribe({
      next: (r) => this.requests = r,
      error: () => {}
    });
  }

  openRequestForm(): void {
    this.requestForm = { title: '', description: '', dueDate: '', requestedFrom: [], saveToFolder: this.currentFolderId };
    this.agentSearch = '';
    this.showRequestForm = true;
  }

  selectAllAgents(): void {
    if (this.requestForm.requestedFrom.length === this.filteredAgents.length) {
      this.requestForm.requestedFrom = [];
    } else {
      this.requestForm.requestedFrom = this.filteredAgents.map(a => a._id);
    }
  }

  get allFilteredSelected(): boolean {
    return this.filteredAgents.length > 0 && this.filteredAgents.every(a => this.requestForm.requestedFrom.includes(a._id));
  }

  get filteredAgents(): User[] {
    if (!this.agentSearch.trim()) return this.agents;
    const q = this.agentSearch.toLowerCase();
    return this.agents.filter(a => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q));
  }

  toggleAgentSelection(agentId: string): void {
    const idx = this.requestForm.requestedFrom.indexOf(agentId);
    if (idx >= 0) this.requestForm.requestedFrom.splice(idx, 1);
    else this.requestForm.requestedFrom.push(agentId);
  }

  isAgentSelected(agentId: string): boolean {
    return this.requestForm.requestedFrom.includes(agentId);
  }

  submitRequest(): void {
    if (!this.requestForm.title.trim()) { this.error = 'Title is required'; return; }
    if (this.requestForm.requestedFrom.length === 0) { this.error = 'Select at least one agent'; return; }
    this.requestSaving = true;
    this.docHubService.createRequest(this.requestForm).subscribe({
      next: () => {
        this.success = 'Document request sent';
        this.showRequestForm = false;
        this.requestSaving = false;
        this.loadRequests();
        setTimeout(() => this.success = '', 3000);
      },
      error: () => { this.requestSaving = false; this.error = 'Failed to create request'; }
    });
  }

  deleteRequest(req: DocRequest): void {
    if (!confirm(`Remove request "${req.title}"?`)) return;
    this.docHubService.deleteRequest(req._id!).subscribe({
      next: () => { this.success = 'Request removed'; this.loadRequests(); setTimeout(() => this.success = '', 3000); },
      error: () => { this.error = 'Failed to remove request'; }
    });
  }

  // Agent: respond to request
  startRespond(requestId: string): void {
    this.respondingRequestId = requestId;
    this.responseFile = null;
    this.responseNotes = '';
  }

  onResponseFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) this.responseFile = input.files[0];
  }

  submitResponse(requestId: string): void {
    if (!this.responseFile) { this.error = 'Select a file'; return; }
    this.docHubService.respondToRequest(requestId, this.responseFile, this.responseNotes).subscribe({
      next: () => {
        this.success = 'Document submitted';
        this.respondingRequestId = '';
        this.responseFile = null;
        this.responseNotes = '';
        this.loadRequests();
        setTimeout(() => this.success = '', 3000);
      },
      error: () => { this.error = 'Failed to submit document'; }
    });
  }

  // Admin: review a response
  reviewResponse(requestId: string, agentId: string, status: string): void {
    const notes = status === 'rejected' ? prompt('Rejection notes (optional):') || '' : '';
    this.docHubService.reviewResponse(requestId, agentId, status, notes).subscribe({
      next: () => {
        this.success = `Response ${status}`;
        this.loadRequests();
        setTimeout(() => this.success = '', 3000);
      },
      error: () => { this.error = 'Failed to review response'; }
    });
  }

  downloadResponse(requestId: string, agentId: string, fileName: string): void {
    this.docHubService.downloadResponse(requestId, agentId).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName || 'document';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: () => { this.error = 'Failed to download'; }
    });
  }

  // --- Drag & Drop ---
  dropFolder(event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const folders = this.subfolders;
    moveItemInArray(folders, event.previousIndex, event.currentIndex);
    const updates: Promise<any>[] = [];
    folders.forEach((folder, index) => {
      folder.sortOrder = index;
      updates.push(
        this.docHubService.updateFolder(folder._id!, { sortOrder: index } as any).toPromise()
      );
    });
    Promise.all(updates).then(() => {
      this.success = 'Folders reordered successfully!';
      setTimeout(() => this.success = '', 3000);
    }).catch(() => {
      this.error = 'Failed to reorder folders.';
      setTimeout(() => this.error = '', 5000);
      this.loadFolders();
    });
  }

  dropFile(event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    moveItemInArray(this.files, event.previousIndex, event.currentIndex);
    const updates: Promise<any>[] = [];
    this.files.forEach((file, index) => {
      (file as any).sortOrder = index;
      updates.push(
        this.docHubService.updateFile(file._id!, { sortOrder: index } as any).toPromise()
      );
    });
    Promise.all(updates).then(() => {
      this.success = 'Files reordered successfully!';
      setTimeout(() => this.success = '', 3000);
    }).catch(() => {
      this.error = 'Failed to reorder files.';
      setTimeout(() => this.error = '', 5000);
      this.loadFiles();
    });
  }

  getRequestStatusBadge(status: string): string {
    const m: any = { pending: 'bg-warning text-dark', submitted: 'bg-info', approved: 'bg-success', rejected: 'bg-danger' };
    return m[status] || 'bg-secondary';
  }

  formatDate(d: any): string {
    if (!d) return '';
    return new Date(d).toLocaleDateString();
  }

  formatFileSize(bytes: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  getFileIcon(mimeType: string): string {
    if (!mimeType) return 'bi-file-earmark';
    if (mimeType.includes('pdf')) return 'bi-file-earmark-pdf-fill text-danger';
    if (mimeType.includes('image')) return 'bi-file-earmark-image-fill text-primary';
    if (mimeType.includes('word') || mimeType.includes('doc')) return 'bi-file-earmark-word-fill text-primary';
    if (mimeType.includes('sheet') || mimeType.includes('excel') || mimeType.includes('csv')) return 'bi-file-earmark-excel-fill text-success';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'bi-file-earmark-slides-fill text-warning';
    return 'bi-file-earmark-fill';
  }
}
