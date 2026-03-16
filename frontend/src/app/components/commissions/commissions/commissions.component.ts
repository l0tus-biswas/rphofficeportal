import { Component, OnInit } from '@angular/core';
import { CommissionService, CommissionStatement } from '../../../services/commission.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-commissions',
  templateUrl: './commissions.component.html',
  styleUrls: ['./commissions.component.css']
})
export class CommissionsComponent implements OnInit {
  statements: CommissionStatement[] = [];
  loading = true;
  error = '';

  // Filters
  filterCarrier = '';
  filterFrom = '';
  filterTo = '';

  constructor(private commissionService: CommissionService) {}

  ngOnInit(): void {
    this.loadStatements();
  }

  loadStatements(): void {
    this.loading = true;
    this.error = '';

    this.commissionService.getStatements({
      carrier: this.filterCarrier || undefined,
      from: this.filterFrom || undefined,
      to: this.filterTo || undefined
    }).subscribe({
      next: (statements) => {
        this.statements = statements;
        this.loading = false;
      },
      error: () => {
        this.error = 'Failed to load commission statements';
        this.loading = false;
      }
    });
  }

  viewStatement(statement: CommissionStatement): void {
    if (!statement.filePath) return;
    const baseUrl = environment.apiUrl.replace('/api', '');
    window.open(`${baseUrl}/${statement.filePath}`, '_blank');
  }

  downloadStatement(statement: CommissionStatement): void {
    if (!statement.filePath) return;
    const baseUrl = environment.apiUrl.replace('/api', '');
    const a = document.createElement('a');
    a.href = `${baseUrl}/${statement.filePath}`;
    a.target = '_blank';
    a.download = statement.originalFileName || 'statement.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  applyFilters(): void {
    this.loadStatements();
  }

  clearFilters(): void {
    this.filterCarrier = '';
    this.filterFrom = '';
    this.filterTo = '';
    this.loadStatements();
  }
}
