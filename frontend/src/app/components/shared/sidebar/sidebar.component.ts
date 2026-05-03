import { Component, OnInit, OnDestroy } from '@angular/core';
import { AuthService } from '../../../services/auth.service';
import { BrandingService, BrandingConfig } from '../../../services/branding.service';
import { NotificationService } from '../../../services/notification.service';
import { BroadcastService } from '../../../services/broadcast.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent implements OnInit, OnDestroy {
  branding: BrandingConfig = { appName: 'RHP Office', appLogo: null };
  unreadCount: number = 0;
  unreadBroadcasts: number = 0;
  logoFailed = false;
  private brandingSub?: Subscription;
  private unreadSub?: Subscription;
  private broadcastSub?: Subscription;

  constructor(
    public authService: AuthService,
    private brandingService: BrandingService,
    private notificationService: NotificationService,
    private broadcastService: BroadcastService
  ) {}

  ngOnInit(): void {
    this.brandingSub = this.brandingService.branding$.subscribe(b => {
      this.branding = b;
      this.logoFailed = false; // reset on each branding update
    });
    if (this.authService.isLoggedIn()) {
      this.unreadSub = this.notificationService.unreadCount$.subscribe(c => (this.unreadCount = c));
      this.notificationService.refreshUnreadCount();
      this.broadcastSub = this.broadcastService.unreadCount$.subscribe(c => (this.unreadBroadcasts = c));
      this.broadcastService.refreshUnreadCount();
    }
  }

  ngOnDestroy(): void {
    this.brandingSub?.unsubscribe();
    this.unreadSub?.unsubscribe();
    this.broadcastSub?.unsubscribe();
  }

  logout(): void {
    this.authService.logout();
    window.location.href = '/login';
  }

  get currentUser() {
    return this.authService.getCurrentUser();
  }
}
