import { Component, OnInit } from '@angular/core';
import { CommissionService, CommissionStatement } from '../../../services/commission.service';

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
    if (!statement._id) return;
    this.commissionService.downloadStatement(statement._id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');
      },
      error: () => { this.error = 'Failed to view statement'; }
    });
  }

  downloadStatement(statement: CommissionStatement): void {
    if (!statement._id) return;
    this.commissionService.downloadStatement(statement._id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = statement.originalFileName || 'statement.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: () => { this.error = 'Failed to download statement'; }
    });
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
