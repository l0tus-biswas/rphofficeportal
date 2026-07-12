import { getAppTimezone } from '../../services/timezone.service';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationService, Notification } from '../../services/notification.service';
import { AuthService } from '../../services/auth.service';

interface PreferenceEntry {
  type: string;
  inApp: boolean;
  email: boolean;
}

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.css']
})
export class NotificationsComponent implements OnInit {
  notifications: Notification[] = [];
  loading: boolean = false;
  page: number = 1;
  totalPages: number = 1;
  unreadCount: number = 0;
  showUnreadOnly: boolean = false;

  // Tab control
  activeTab: 'notifications' | 'preferences' | 'broadcast' = 'notifications';

  // Preferences
  categories: { [key: string]: string[] } = {};
  preferencesMap: { [type: string]: { inApp: boolean; email: boolean } } = {};
  muteAllEmails: boolean = false;
  prefsLoading: boolean = false;
  prefsSaving: boolean = false;
  prefsMessage: string = '';

  // Broadcast (admin)
  broadcastTitle: string = '';
  broadcastMessage: string = '';
  broadcastLink: string = '';
  broadcastRoles: string[] = [];
  broadcastSending: boolean = false;
  broadcastResult: string = '';

  constructor(
    private notificationService: NotificationService,
    private router: Router,
    public authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadNotifications();
  }

  loadNotifications(): void {
    this.loading = true;
    this.notificationService.getNotifications(this.page, 20, this.showUnreadOnly).subscribe({
      next: (response) => {
        this.notifications = response?.notifications ?? response?.data?.notifications ?? [];
        this.totalPages = response?.pagination?.pages ?? response?.data?.pagination?.pages ?? 1;
        this.unreadCount = response?.unreadCount ?? response?.data?.unreadCount ?? 0;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading notifications:', error);
        this.notifications = [];
        this.loading = false;
      }
    });
  }

  toggleUnreadFilter(): void {
    this.showUnreadOnly = !this.showUnreadOnly;
    this.page = 1;
    this.loadNotifications();
  }

  markAsRead(notification: Notification): void {
    if (!notification.isRead) {
      this.notificationService.markAsRead(notification._id).subscribe({
        next: () => {
          notification.isRead = true;
          this.notificationService.refreshUnreadCount();
          if (notification.link) {
            this.navigateToLink(notification.link);
          }
        },
        error: (error) => {
          console.error('Error marking notification as read:', error);
        }
      });
    } else if (notification.link) {
      this.navigateToLink(notification.link);
    }
  }

  // Links may include a query string (e.g. /document-hub?section=requests).
  // router.navigate([...]) would URL-encode the "?", so route those via navigateByUrl.
  private navigateToLink(link: string): void {
    if (link.includes('?')) {
      this.router.navigateByUrl(link);
    } else {
      this.router.navigate([link]);
    }
  }

  markAllAsRead(): void {
    this.notificationService.markAllAsRead().subscribe({
      next: () => {
        this.notifications.forEach(n => n.isRead = true);
        this.unreadCount = 0;
        this.notificationService.refreshUnreadCount();
      },
      error: (error) => {
        console.error('Error marking all as read:', error);
      }
    });
  }

  deleteNotification(notification: Notification, event: Event): void {
    event.stopPropagation();
    if (confirm('Delete this notification?')) {
      this.notificationService.deleteNotification(notification._id).subscribe({
        next: () => {
          this.notifications = this.notifications.filter(n => n._id !== notification._id);
          this.notificationService.refreshUnreadCount();
        },
        error: (error) => {
          console.error('Error deleting notification:', error);
        }
      });
    }
  }

  deleteAllRead(): void {
    if (confirm('Delete all read notifications?')) {
      this.notificationService.deleteAllRead().subscribe({
        next: () => {
          this.notifications = this.notifications.filter(n => !n.isRead);
        },
        error: (error) => {
          console.error('Error deleting read notifications:', error);
        }
      });
    }
  }

  nextPage(): void {
    if (this.page < this.totalPages) {
      this.page++;
      this.loadNotifications();
    }
  }

  prevPage(): void {
    if (this.page > 1) {
      this.page--;
      this.loadNotifications();
    }
  }

  getNotificationIcon(type: string): string {
    const icons: any = {
      // Activity
      'login':                  'bi-box-arrow-in-right',
      'profile_updated':        'bi-person-check-fill',
      'password_changed':       'bi-shield-lock-fill',
      'password_reset':         'bi-key-fill',
      // Recruitment
      'recruit_added':          'bi-person-plus-fill',
      'downline_recruit':       'bi-people-fill',
      // Payments
      'payment_completed':      'bi-check-circle-fill',
      'payment_failed':         'bi-x-circle-fill',
      'subscription_updated':   'bi-arrow-repeat',
      'subscription_canceled':  'bi-slash-circle-fill',
      'agent_subscription_canceled': 'bi-slash-circle-fill',
      // APA
      'apa_submitted':          'bi-file-earmark-arrow-up-fill',
      'apa_approved':           'bi-patch-check-fill',
      'apa_rejected':           'bi-patch-exclamation-fill',
      // Onboarding
      'onboarding_submitted':   'bi-cloud-upload-fill',
      'onboarding_step_updated':'bi-file-earmark-text-fill',
      'onboarding_approved':    'bi-check-circle-fill',
      'onboarding_rejected':    'bi-x-circle-fill',
      // Licensing
      'license_submitted':      'bi-file-earmark-text-fill',
      'license_approved':       'bi-award-fill',
      // Production
      'production_submitted':   'bi-graph-up-arrow',
      'production_reviewed':    'bi-clipboard-check-fill',
      // Training
      'training_completed':     'bi-mortarboard-fill',
      // Admin actions
      'user_created':           'bi-person-fill-add',
      'user_activated':         'bi-person-check-fill',
      'user_deactivated':       'bi-person-fill-slash',
      'user_promoted':          'bi-trophy-fill',
      'user_transferred':       'bi-arrow-left-right',
      // Carrier
      'carrier_contract_requested': 'bi-file-earmark-plus-fill',
      'carrier_appointed':      'bi-building-fill-check',
      'carrier_unappointed':    'bi-building-fill-slash',
      // RHP Vault
      'document_request':       'bi-file-earmark-arrow-down-fill',
      'document_submitted':     'bi-file-earmark-arrow-up-fill',
      'document_reviewed':      'bi-file-earmark-check-fill',
      // New types
      'new_agent_registered':   'bi-person-fill-add',
      'production_in_force':    'bi-shield-fill-check',
      'admin_broadcast':        'bi-broadcast-pin',
      // Misc
      'system_announcement':    'bi-megaphone-fill',
      'promotion_eligible':     'bi-star-fill'
    };
    return icons[type] || 'bi-bell-fill';
  }

  getNotificationColor(type: string): string {
    const colorMap: any = {
      'login':                  'secondary',
      'profile_updated':        'info',
      'password_changed':       'warning',
      'password_reset':         'warning',
      'recruit_added':          'primary',
      'downline_recruit':       'primary',
      'payment_completed':      'success',
      'payment_failed':         'danger',
      'subscription_updated':   'info',
      'subscription_canceled':  'danger',
      'agent_subscription_canceled': 'danger',
      'apa_submitted':          'info',
      'apa_approved':           'success',
      'apa_rejected':           'danger',
      'onboarding_submitted':   'info',
      'onboarding_step_updated':'warning',
      'onboarding_approved':    'success',
      'onboarding_rejected':    'danger',
      'license_submitted':      'info',
      'license_approved':       'success',
      'production_submitted':   'primary',
      'production_reviewed':    'success',
      'training_completed':     'success',
      'user_created':           'primary',
      'user_activated':         'success',
      'user_deactivated':       'danger',
      'user_promoted':          'warning',
      'user_transferred':       'info',
      // Carrier
      'carrier_contract_requested': 'info',
      'carrier_appointed':      'success',
      'carrier_unappointed':    'secondary',
      // RHP Vault
      'document_request':       'info',
      'document_submitted':     'primary',
      'document_reviewed':      'success',
      // New types
      'new_agent_registered':   'success',
      'production_in_force':    'success',
      'admin_broadcast':        'dark',
      // Misc
      'system_announcement':    'dark',
      'promotion_eligible':     'warning'
    };
    return colorMap[type] || 'info';
  }

  getTimeAgo(date: string): string {
    const now = new Date();
    const notifDate = new Date(date);
    const diff = now.getTime() - notifDate.getTime();
    
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks}w ago`;
    
    return notifDate.toLocaleDateString('en-US', { timeZone: getAppTimezone() });
  }

  // ─── Tab switching ───
  switchTab(tab: 'notifications' | 'preferences' | 'broadcast'): void {
    this.activeTab = tab;
    if (tab === 'preferences' && Object.keys(this.categories).length === 0) {
      this.loadPreferences();
    }
  }

  // ─── Preferences ───
  loadPreferences(): void {
    this.prefsLoading = true;
    this.prefsMessage = '';
    this.notificationService.getPreferences().subscribe({
      next: (response: any) => {
        const data = response?.preferences || response?.data?.preferences || response;
        this.categories = response?.categories || response?.data?.categories || {};
        this.muteAllEmails = data?.muteAllEmails || false;

        // Build preferences map with defaults (all enabled)
        const savedPrefs = data?.preferences || {};
        this.preferencesMap = {};
        for (const types of Object.values(this.categories)) {
          for (const type of types as string[]) {
            const saved = savedPrefs[type];
            this.preferencesMap[type] = {
              inApp: saved?.inApp !== false,
              email: saved?.email !== false
            };
          }
        }
        this.prefsLoading = false;
      },
      error: (error: any) => {
        console.error('Error loading preferences:', error);
        this.prefsLoading = false;
      }
    });
  }

  savePreferences(): void {
    this.prefsSaving = true;
    this.prefsMessage = '';
    this.notificationService.updatePreferences(this.preferencesMap, this.muteAllEmails).subscribe({
      next: () => {
        this.prefsSaving = false;
        this.prefsMessage = 'Preferences saved successfully!';
        setTimeout(() => this.prefsMessage = '', 3000);
      },
      error: (error: any) => {
        console.error('Error saving preferences:', error);
        this.prefsSaving = false;
        this.prefsMessage = 'Failed to save preferences.';
      }
    });
  }

  getCategoryTypes(category: string): string[] {
    return this.categories[category] || [];
  }

  getCategoryList(): string[] {
    return Object.keys(this.categories);
  }

  formatTypeName(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  toggleCategoryInApp(category: string): void {
    const types = this.getCategoryTypes(category);
    const allOn = types.every(t => this.preferencesMap[t]?.inApp !== false);
    types.forEach(t => {
      if (this.preferencesMap[t]) this.preferencesMap[t].inApp = !allOn;
    });
  }

  toggleCategoryEmail(category: string): void {
    const types = this.getCategoryTypes(category);
    const allOn = types.every(t => this.preferencesMap[t]?.email !== false);
    types.forEach(t => {
      if (this.preferencesMap[t]) this.preferencesMap[t].email = !allOn;
    });
  }

  // ─── Broadcast (Admin only) ───
  toggleBroadcastRole(role: string): void {
    const idx = this.broadcastRoles.indexOf(role);
    if (idx >= 0) this.broadcastRoles.splice(idx, 1);
    else this.broadcastRoles.push(role);
  }

  sendBroadcast(): void {
    if (!this.broadcastTitle.trim() || !this.broadcastMessage.trim()) return;
    this.broadcastSending = true;
    this.broadcastResult = '';
    this.notificationService.broadcast(
      this.broadcastTitle.trim(),
      this.broadcastMessage.trim(),
      this.broadcastLink.trim() || undefined,
      this.broadcastRoles.length > 0 ? this.broadcastRoles : undefined
    ).subscribe({
      next: (response: any) => {
        const count = response?.sentCount || response?.data?.sentCount || 0;
        this.broadcastResult = `Broadcast sent to ${count} users`;
        this.broadcastSending = false;
        this.broadcastTitle = '';
        this.broadcastMessage = '';
        this.broadcastLink = '';
        this.broadcastRoles = [];
      },
      error: (error: any) => {
        console.error('Broadcast error:', error);
        this.broadcastResult = 'Failed to send broadcast.';
        this.broadcastSending = false;
      }
    });
  }
}
