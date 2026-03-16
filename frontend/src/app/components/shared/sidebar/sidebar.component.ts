import { Component, OnInit, OnDestroy } from '@angular/core';
import { AuthService } from '../../../services/auth.service';
import { BrandingService, BrandingConfig } from '../../../services/branding.service';
import { NotificationService } from '../../../services/notification.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent implements OnInit, OnDestroy {
  branding: BrandingConfig = { appName: 'RHP Office', appLogo: null };
  unreadCount: number = 0;
  logoFailed = false;
  private brandingSub?: Subscription;
  private unreadSub?: Subscription;

  constructor(
    public authService: AuthService,
    private brandingService: BrandingService,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    this.brandingSub = this.brandingService.branding$.subscribe(b => {
      this.branding = b;
      this.logoFailed = false; // reset on each branding update
    });
    if (this.authService.isLoggedIn()) {
      this.unreadSub = this.notificationService.unreadCount$.subscribe(c => (this.unreadCount = c));
      this.notificationService.refreshUnreadCount();
    }
  }

  ngOnDestroy(): void {
    this.brandingSub?.unsubscribe();
    this.unreadSub?.unsubscribe();
  }

  logout(): void {
    this.authService.logout();
    window.location.href = '/login';
  }

  get currentUser() {
    return this.authService.getCurrentUser();
  }
}
