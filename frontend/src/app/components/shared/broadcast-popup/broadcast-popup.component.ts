import { Component, OnInit, OnDestroy } from '@angular/core';
import { BroadcastService, Broadcast } from '../../../services/broadcast.service';
import { BroadcastPopupService } from '../../../services/broadcast-popup.service';
import { AuthService } from '../../../services/auth.service';
import { Router } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-broadcast-popup',
  templateUrl: './broadcast-popup.component.html',
  styleUrls: ['./broadcast-popup.component.css']
})
export class BroadcastPopupComponent implements OnInit, OnDestroy {
  currentBroadcast: Broadcast | null = null;
  isVisible = false;
  remainingCount = 0;
  private popupSubscription?: Subscription;

  constructor(
    private broadcastPopupService: BroadcastPopupService,
    private broadcastService: BroadcastService,
    private router: Router,
    public authService: AuthService
  ) {}

  ngOnInit(): void {
    this.popupSubscription = this.broadcastPopupService.showPopup$.subscribe(broadcast => {
      if (broadcast) {
        this.currentBroadcast = broadcast;
        this.isVisible = true;
        this.remainingCount = this.broadcastPopupService.queueLength;
      }
    });
  }

  ngOnDestroy(): void {
    this.popupSubscription?.unsubscribe();
  }

  dismiss(): void {
    if (this.currentBroadcast) {
      this.broadcastService.markBroadcastDismissed(this.currentBroadcast._id);
      this.broadcastPopupService.dismissBroadcast(this.currentBroadcast._id);
      // Also mark as read on server so it doesn't reappear on next login
      this.broadcastService.getBroadcast(this.currentBroadcast._id).subscribe({
        next: () => this.broadcastService.refreshUnreadCount()
      });
    }
    this.close();
  }

  markAsRead(): void {
    if (this.currentBroadcast) {
      this.broadcastService.markBroadcastDismissed(this.currentBroadcast._id);
      this.broadcastService.getBroadcast(this.currentBroadcast._id).subscribe({
        next: () => {
          this.currentBroadcast!.isRead = true;
          this.broadcastService.refreshUnreadCount();
          this.close();
        }
      });
    }
  }

  navigateToAnnouncement(): void {
    if (!this.currentBroadcast) return;

    this.broadcastService.markBroadcastDismissed(this.currentBroadcast._id);
    // Mark as read on the server
    this.broadcastService.getBroadcast(this.currentBroadcast._id).subscribe({
      next: () => this.broadcastService.refreshUnreadCount()
    });

    const broadcastId = this.currentBroadcast._id;
    this.close();
    this.router.navigate(['/broadcasts'], { queryParams: { open: broadcastId } });
  }

  close(): void {
    this.isVisible = false;
    this.broadcastPopupService.hidePopup();
  }

  getImageUrl(imagePath: string | undefined): string {
    if (!imagePath) return '';
    if (imagePath.startsWith('http')) return imagePath;
    return `${environment.baseUrl}${imagePath}`;
  }
}
