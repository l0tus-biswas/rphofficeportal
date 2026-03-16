import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationService, Notification } from '../../services/notification.service';

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

  constructor(
    private notificationService: NotificationService,
    private router: Router
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
            this.router.navigate([notification.link]);
          }
        },
        error: (error) => {
          console.error('Error marking notification as read:', error);
        }
      });
    } else if (notification.link) {
      this.router.navigate([notification.link]);
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
    
    return notifDate.toLocaleDateString();
  }
}
