import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommissionService, CommissionStatement } from '../../../services/commission.service';
import { environment } from '../../../../environments/environment';

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
  uploadCarrier = '';
  uploadPayPeriod = '';
  uploadFile: File | null = null;

  constructor(
    private commissionService: CommissionService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.loadAgents();
    this.loadStatements();
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

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.uploadFile = input.files && input.files.length > 0 ? input.files[0] : null;
  }

  uploadStatement(): void {
    if (!this.uploadAgentId) { this.error = 'Please select an agent'; return; }
    if (!this.uploadCarrier) { this.error = 'Please enter a carrier name'; return; }
    if (!this.uploadPayPeriod) { this.error = 'Please enter a pay period date'; return; }
    if (!this.uploadFile) { this.error = 'Please select a PDF file'; return; }

    this.uploading = true;
    this.error = '';

    const formData = new FormData();
    formData.append('agentId', this.uploadAgentId);
    formData.append('carrier', this.uploadCarrier);
    formData.append('payPeriod', this.uploadPayPeriod);
    formData.append('statementFile', this.uploadFile);

    this.commissionService.uploadStatement(formData).subscribe({
      next: () => {
        this.success = 'Commission statement uploaded successfully';
        this.showUploadForm = false;
        this.uploadAgentId = '';
        this.uploadCarrier = '';
        this.uploadPayPeriod = '';
        this.uploadFile = null;
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
}
