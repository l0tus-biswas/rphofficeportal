import { Component, OnInit } from '@angular/core';
import { BroadcastService, Broadcast } from '../../services/broadcast.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-broadcasts',
  templateUrl: './broadcasts.component.html',
  styleUrls: ['./broadcasts.component.css']
})
export class BroadcastsComponent implements OnInit {
  broadcasts: Broadcast[] = [];
  loading = false;
  page = 1;
  totalPages = 1;
  total = 0;
  selectedBroadcast: Broadcast | null = null;

  constructor(
    private broadcastService: BroadcastService,
    public authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadBroadcasts();
  }

  loadBroadcasts(): void {
    this.loading = true;
    this.broadcastService.getBroadcasts(this.page).subscribe({
      next: (res: any) => {
        this.broadcasts = res?.broadcasts || res?.data?.broadcasts || [];
        const pagination = res?.pagination || res?.data?.pagination;
        this.totalPages = pagination?.pages || 1;
        this.total = pagination?.total || 0;
        this.loading = false;
      },
      error: () => {
        this.broadcasts = [];
        this.loading = false;
      }
    });
  }

  viewBroadcast(broadcast: Broadcast): void {
    this.selectedBroadcast = broadcast;
    // Mark as read on backend
    this.broadcastService.getBroadcast(broadcast._id).subscribe({
      next: () => {
        broadcast.isRead = true;
      }
    });
  }

  closeBroadcast(): void {
    this.selectedBroadcast = null;
  }

  prevPage(): void {
    if (this.page > 1) { this.page--; this.loadBroadcasts(); }
  }

  nextPage(): void {
    if (this.page < this.totalPages) { this.page++; this.loadBroadcasts(); }
  }

  timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }
}
