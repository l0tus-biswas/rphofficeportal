import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommissionService, CommissionStatement } from '../../../services/commission.service';
import { environment } from '../../../../environments/environment';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-commission-statements',
  templateUrl: './commission-statements.component.html',
  styleUrls: ['./commission-statements.component.css']
})
export class CommissionStatementsComponent implements OnInit {
  statements: CommissionStatement[] = [];
  agents: any[] = [];
  loading = true;
  uploading = false;
  error = '';
  success = '';

  // Filter
  filterAgentId = '';

  // Upload form
  showUploadForm = false;
  uploadAgentId = '';
  uploadCarriers: string[] = [];
  carrierInput = '';
  uploadPayPeriod = '';
  uploadFiles: File[] = [];
  uploadNotes = '';

  // Edit form
  showEditModal = false;
  editStatement: CommissionStatement | null = null;
  editAgentId = '';
  editCarriers: string[] = [];
  editCarrierInput = '';
  editPayPeriod = '';
  editFile: File | null = null;
  editNotes = '';
  editAgentSearchQuery = '';
  editFilteredAgents: any[] = [];
  editAgentSearch$ = new Subject<string>();
  showEditAgentDropdown = false;
  editSelectedAgentName = '';
  saving = false;

  // 6.4: Agent search
  agentSearchQuery = '';
  filteredAgents: any[] = [];
  agentSearch$ = new Subject<string>();
  showAgentDropdown = false;
  selectedAgentName = '';

  // 6.3: Notes modal
  showNotesModal = false;
  selectedStatement: CommissionStatement | null = null;
  newNoteText = '';
  addingNote = false;

  constructor(
    public commissionService: CommissionService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.loadAgents();
    this.loadStatements();

    // 6.4: Debounced agent search (upload form)
    this.agentSearch$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => this.commissionService.searchAgents(q))
    ).subscribe({
      next: (res) => {
        this.filteredAgents = res.agents || [];
        this.showAgentDropdown = this.filteredAgents.length > 0;
      },
      error: () => { this.filteredAgents = []; }
    });

    // Debounced agent search (edit form)
    this.editAgentSearch$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => this.commissionService.searchAgents(q))
    ).subscribe({
      next: (res) => {
        this.editFilteredAgents = res.agents || [];
        this.showEditAgentDropdown = this.editFilteredAgents.length > 0;
      },
      error: () => { this.editFilteredAgents = []; }
    });
  }

  loadAgents(): void {
    this.http.get<any>(`${environment.apiUrl}/admin/users?role=agent&limit=500`).subscribe({
      next: (res) => { this.agents = res.users || res; },
      error: () => { this.agents = []; }
    });
  }

  loadStatements(): void {
    this.loading = true;
    this.commissionService.getStatements({ agentId: this.filterAgentId || undefined }).subscribe({
      next: (statements) => {
        this.statements = statements;
        this.loading = false;
      },
      error: () => {
        this.error = 'Failed to load statements';
        this.loading = false;
      }
    });
  }

  // 6.4: Agent search methods
  onAgentSearch(query: string): void {
    this.agentSearchQuery = query;
    if (query.length >= 2) {
      this.agentSearch$.next(query);
    } else {
      this.filteredAgents = [];
      this.showAgentDropdown = false;
    }
  }

  selectAgent(agent: any): void {
    this.uploadAgentId = agent._id;
    this.selectedAgentName = agent.name + ' — ' + agent.email;
    this.agentSearchQuery = this.selectedAgentName;
    this.showAgentDropdown = false;
  }

  clearSelectedAgent(): void {
    this.uploadAgentId = '';
    this.selectedAgentName = '';
    this.agentSearchQuery = '';
    this.filteredAgents = [];
  }

  // 6.2: Multi-carrier tag methods
  addCarrier(): void {
    const c = this.carrierInput.trim();
    if (c && !this.uploadCarriers.includes(c)) {
      this.uploadCarriers.push(c);
    }
    this.carrierInput = '';
  }

  addCarrierOnKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addCarrier();
    }
  }

  removeCarrier(index: number): void {
    this.uploadCarriers.splice(index, 1);
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.uploadFiles = Array.from(input.files);
    } else {
      this.uploadFiles = [];
    }
  }

  // 6.5: Remove file before submit
  removeFile(index?: number): void {
    if (index !== undefined) {
      this.uploadFiles.splice(index, 1);
    } else {
      this.uploadFiles = [];
    }
    if (this.uploadFiles.length === 0) {
      const fileInput = document.querySelector('input[name="statementFile"]') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    }
  }

  uploadStatement(): void {
    if (!this.uploadAgentId) { this.error = 'Please select an agent'; return; }
    if (!this.uploadPayPeriod) { this.error = 'Please enter a pay period date'; return; }
    if (this.uploadFiles.length === 0) { this.error = 'Please select at least one file'; return; }

    this.uploading = true;
    this.error = '';

    const formData = new FormData();
    formData.append('agentId', this.uploadAgentId);
    formData.append('carriers', JSON.stringify(this.uploadCarriers));
    formData.append('payPeriod', this.uploadPayPeriod);
    if (this.uploadNotes.trim()) {
      formData.append('notes', this.uploadNotes.trim());
    }
    for (const file of this.uploadFiles) {
      formData.append('statementFile', file);
    }

    this.commissionService.uploadStatement(formData).subscribe({
      next: () => {
        this.success = 'Commission statement(s) uploaded successfully';
        this.showUploadForm = false;
        this.uploadAgentId = '';
        this.uploadCarriers = [];
        this.carrierInput = '';
        this.uploadPayPeriod = '';
        this.uploadFiles = [];
        this.uploadNotes = '';
        this.selectedAgentName = '';
        this.agentSearchQuery = '';
        this.uploading = false;
        this.loadStatements();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Upload failed';
        this.uploading = false;
      }
    });
  }

  deleteStatement(id: string | undefined): void {
    if (!id) return;
    if (!confirm('Delete this commission statement?')) return;

    this.commissionService.deleteStatement(id).subscribe({
      next: () => {
        this.success = 'Statement deleted';
        this.loadStatements();
        setTimeout(() => this.success = '', 3000);
      },
      error: () => { this.error = 'Failed to delete statement'; }
    });
  }

  // 6.3: Notes methods
  openNotes(stmt: CommissionStatement): void {
    this.selectedStatement = stmt;
    this.newNoteText = '';
    this.showNotesModal = true;
  }

  closeNotes(): void {
    this.showNotesModal = false;
    this.selectedStatement = null;
    this.newNoteText = '';
  }

  addNote(): void {
    if (!this.selectedStatement?._id || !this.newNoteText.trim()) return;
    this.addingNote = true;
    this.commissionService.addNote(this.selectedStatement._id, this.newNoteText.trim()).subscribe({
      next: (res) => {
        if (this.selectedStatement) {
          this.selectedStatement.notes = res.notes || [];
        }
        this.newNoteText = '';
        this.addingNote = false;
        this.loadStatements();
      },
      error: () => {
        this.error = 'Failed to add note';
        this.addingNote = false;
      }
    });
  }

  deleteNote(noteId: string): void {
    if (!this.selectedStatement?._id || !noteId) return;
    if (!confirm('Delete this note?')) return;
    this.commissionService.deleteNote(this.selectedStatement._id, noteId).subscribe({
      next: (res) => {
        if (this.selectedStatement) {
          this.selectedStatement.notes = res.notes || [];
        }
        this.loadStatements();
      },
      error: () => { this.error = 'Failed to delete note'; }
    });
  }

  downloadStatement(stmt: CommissionStatement): void {
    if (!stmt._id) return;
    this.commissionService.downloadStatement(stmt._id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = stmt.originalFileName || 'statement.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        console.error('Download error:', err);
        this.error = 'Failed to download statement. Please try again.';
      }
    });
  }

  // --- Edit methods ---
  openEdit(stmt: CommissionStatement): void {
    this.editStatement = stmt;
    this.editAgentId = stmt.agent?._id || '';
    this.editSelectedAgentName = stmt.agent ? `${stmt.agent.name} — ${stmt.agent.email}` : '';
    this.editAgentSearchQuery = this.editSelectedAgentName;
    this.editCarriers = [...(stmt.carriers || (stmt.carrier ? [stmt.carrier] : []))];
    this.editCarrierInput = '';
    this.editPayPeriod = stmt.payPeriod ? new Date(stmt.payPeriod).toISOString().slice(0, 10) : '';
    this.editFile = null;
    this.editNotes = '';
    this.showEditModal = true;
  }

  closeEdit(): void {
    this.showEditModal = false;
    this.editStatement = null;
  }

  onEditAgentSearch(query: string): void {
    this.editAgentSearchQuery = query;
    if (query.length >= 2) {
      this.editAgentSearch$.next(query);
    } else {
      this.editFilteredAgents = [];
      this.showEditAgentDropdown = false;
    }
  }

  selectEditAgent(agent: any): void {
    this.editAgentId = agent._id;
    this.editSelectedAgentName = agent.name + ' — ' + agent.email;
    this.editAgentSearchQuery = this.editSelectedAgentName;
    this.showEditAgentDropdown = false;
  }

  clearEditAgent(): void {
    this.editAgentId = '';
    this.editSelectedAgentName = '';
    this.editAgentSearchQuery = '';
    this.editFilteredAgents = [];
  }

  addEditCarrier(): void {
    const c = this.editCarrierInput.trim();
    if (c && !this.editCarriers.includes(c)) {
      this.editCarriers.push(c);
    }
    this.editCarrierInput = '';
  }

  addEditCarrierOnKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addEditCarrier();
    }
  }

  removeEditCarrier(index: number): void {
    this.editCarriers.splice(index, 1);
  }

  onEditFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.editFile = input.files && input.files.length > 0 ? input.files[0] : null;
  }

  saveEdit(): void {
    if (!this.editStatement?._id) return;
    this.saving = true;
    this.error = '';

    const formData = new FormData();
    if (this.editAgentId) formData.append('agentId', this.editAgentId);
    formData.append('carriers', JSON.stringify(this.editCarriers));
    if (this.editPayPeriod) formData.append('payPeriod', this.editPayPeriod);
    if (this.editNotes.trim()) formData.append('notes', this.editNotes.trim());
    if (this.editFile) formData.append('statementFile', this.editFile);

    this.commissionService.updateStatement(this.editStatement._id, formData).subscribe({
      next: () => {
        this.success = 'Statement updated successfully';
        this.showEditModal = false;
        this.editStatement = null;
        this.saving = false;
        this.loadStatements();
        setTimeout(() => this.success = '', 5000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Update failed';
        this.saving = false;
      }
    });
  }

  getCarrierDisplay(stmt: CommissionStatement): string {
    const list = stmt.carrierList || stmt.carriers || [];
    return list.length > 0 ? list.join(', ') : (stmt.carrier || '—');
  }
}
