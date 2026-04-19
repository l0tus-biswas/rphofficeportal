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
  uploadFile: File | null = null;

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

    // 6.4: Debounced agent search
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
    this.uploadFile = input.files && input.files.length > 0 ? input.files[0] : null;
  }

  // 6.5: Remove file before submit
  removeFile(): void {
    this.uploadFile = null;
    const fileInput = document.querySelector('input[name="statementFile"]') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  }

  uploadStatement(): void {
    if (!this.uploadAgentId) { this.error = 'Please select an agent'; return; }
    if (!this.uploadPayPeriod) { this.error = 'Please enter a pay period date'; return; }
    if (!this.uploadFile) { this.error = 'Please select a PDF file'; return; }

    this.uploading = true;
    this.error = '';

    const formData = new FormData();
    formData.append('agentId', this.uploadAgentId);
    formData.append('carriers', JSON.stringify(this.uploadCarriers));
    formData.append('payPeriod', this.uploadPayPeriod);
    formData.append('statementFile', this.uploadFile);

    this.commissionService.uploadStatement(formData).subscribe({
      next: () => {
        this.success = 'Commission statement uploaded successfully';
        this.showUploadForm = false;
        this.uploadAgentId = '';
        this.uploadCarriers = [];
        this.carrierInput = '';
        this.uploadPayPeriod = '';
        this.uploadFile = null;
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
      error: () => { this.error = 'Failed to download statement'; }
    });
  }

  getCarrierDisplay(stmt: CommissionStatement): string {
    const list = stmt.carrierList || stmt.carriers || [];
    return list.length > 0 ? list.join(', ') : (stmt.carrier || '—');
  }
}
