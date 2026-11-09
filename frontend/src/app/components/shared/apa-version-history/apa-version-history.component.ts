import { Component, Input, OnChanges } from '@angular/core';
import { ApaEditService, ApaVersion, ApaVersionReason } from '../../../services/apa-edit.service';

// Simple read-only version history of an APA application: the current version
// first, then each superseded version with its signed PDF and a field summary.
@Component({
  selector: 'app-apa-version-history',
  templateUrl: './apa-version-history.component.html'
})
export class ApaVersionHistoryComponent implements OnChanges {
  // Admin passes the application id; the agent view omits it.
  @Input() applicationId?: string;

  versions: ApaVersion[] = [];
  loading = true;
  error = '';
  expanded: Record<number, boolean> = {};

  private reasonLabels: Record<ApaVersionReason, string> = {
    original: 'Original application',
    edit_request: 'Edited after an approved edit request',
    rejection_resubmit: 'Corrected and resubmitted after rejection'
  };

  constructor(private apaEditService: ApaEditService) {}

  ngOnChanges(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    const request$ = this.applicationId
      ? this.apaEditService.getAdminVersions(this.applicationId)
      : this.apaEditService.getVersions();
    request$.subscribe({
      next: (res) => {
        this.versions = res.versions || [];
        this.loading = false;
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Could not load version history';
        this.loading = false;
      }
    });
  }

  reasonLabel(reason: ApaVersionReason): string {
    return this.reasonLabels[reason] || reason;
  }

  toggle(version: number): void {
    this.expanded[version] = !this.expanded[version];
  }

  // Flatten a snapshot into label/value rows for display.
  rows(snapshot: any): { label: string; value: string }[] {
    const out: { label: string; value: string }[] = [];
    const walk = (obj: any, prefix: string) => {
      if (obj == null) return;
      for (const [key, val] of Object.entries(obj)) {
        const path = prefix ? `${prefix} › ${this.humanize(key)}` : this.humanize(key);
        if (Array.isArray(val)) {
          out.push({ label: path, value: val.join(', ') || '—' });
        } else if (val && typeof val === 'object') {
          walk(val, path);
        } else if (key !== '_id') {
          out.push({ label: path, value: val === '' || val == null ? '—' : String(val) });
        }
      }
    };
    walk(snapshot, '');
    return out;
  }

  private humanize(key: string): string {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
  }
}
