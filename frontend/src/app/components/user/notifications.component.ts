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
        this.notifications = response?.data?.notifications || [];
        this.totalPages = response?.data?.pagination?.pages || 1;
        this.unreadCount = response?.data?.unreadCount || 0;
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
      'recruit_added': 'bi-person-plus-fill',
      'downline_recruit': 'bi-people-fill',
      'payment_completed': 'bi-check-circle-fill',
      'payment_failed': 'bi-x-circle-fill',
      'apa_approved': 'bi-check-circle-fill',
      'apa_rejected': 'bi-x-circle-fill',
      'onboarding_approved': 'bi-check-circle-fill',
      'onboarding_rejected': 'bi-x-circle-fill',
      'license_submitted': 'bi-file-earmark-text-fill',
      'license_approved': 'bi-award-fill',
      'production_submitted': 'bi-graph-up-arrow',
      'training_completed': 'bi-mortarboard-fill',
      'system_announcement': 'bi-megaphone-fill'
    };
    return icons[type] || 'bi-bell-fill';
  }

  getNotificationColor(type: string): string {
    if (type.includes('approved') || type.includes('completed')) return 'success';
    if (type.includes('rejected') || type.includes('failed')) return 'danger';
    if (type.includes('recruit') || type.includes('downline')) return 'primary';
    return 'info';
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
