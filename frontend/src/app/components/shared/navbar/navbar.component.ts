import { Component, OnInit, OnDestroy } from '@angular/core';
import { AuthService } from '../../../services/auth.service';
import { BrandingService, BrandingConfig } from '../../../services/branding.service';
import { NotificationService } from '../../../services/notification.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css']
})
export class NavbarComponent implements OnInit, OnDestroy {
  branding: BrandingConfig = { appName: 'RHP Office', appLogo: null };
  private brandingSubscription?: Subscription;
  private unreadCountSubscription?: Subscription;
  unreadCount: number = 0;

  constructor(
    public authService: AuthService,
    private brandingService: BrandingService,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    this.brandingSubscription = this.brandingService.branding$.subscribe(branding => {
      this.branding = branding;
    });

    // Subscribe to unread notification count
    if (this.authService.isLoggedIn()) {
      this.unreadCountSubscription = this.notificationService.unreadCount$.subscribe(count => {
        this.unreadCount = count;
      });
      // Initial fetch
      this.notificationService.refreshUnreadCount();
    }
  }

  ngOnDestroy(): void {
    if (this.brandingSubscription) {
      this.brandingSubscription.unsubscribe();
    }
    if (this.unreadCountSubscription) {
      this.unreadCountSubscription.unsubscribe();
    }
  }

  logout(): void {
    this.authService.logout();
    window.location.href = '/login';
  }

  get currentUser() {
    return this.authService.getCurrentUser();
  }
}
