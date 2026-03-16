import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../../environments/environment';

interface ChecklistItem {
  label: string;
  completed: boolean;
  link?: string;
}

@Component({
  selector: 'app-next-steps-checklist',
  templateUrl: './next-steps-checklist.component.html',
  styleUrls: ['./next-steps-checklist.component.css']
})
export class NextStepsChecklistComponent implements OnInit {
  checklist: ChecklistItem[] = [];
  loading = true;
  allComplete = false;

  constructor(private http: HttpClient, private router: Router) {}

  ngOnInit(): void {
    this.http.get<{ checklist: ChecklistItem[] }>(`${environment.apiUrl}/agent/dashboard/checklist`).subscribe({
      next: (res) => {
        this.checklist = res.checklist;
        this.allComplete = this.checklist.every(item => item.completed);
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  get completedCount(): number {
    return this.checklist.filter(i => i.completed).length;
  }

  get progressPercent(): number {
    return this.checklist.length > 0
      ? Math.round((this.completedCount / this.checklist.length) * 100)
      : 0;
  }

  isExternal(link: string): boolean {
    return link.startsWith('http://') || link.startsWith('https://');
  }

  navigate(item: ChecklistItem): void {
    if (!item.link) return;
    if (this.isExternal(item.link)) {
      window.open(item.link, '_blank');
    } else {
      this.router.navigate([item.link]);
    }
  }
}
