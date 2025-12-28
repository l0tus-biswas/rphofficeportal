import { Component, OnInit, OnDestroy } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { AgentService } from '../../services/agent.service';
import { AdminService } from '../../services/admin.service';
import { LicensingService, LicensingProgress } from '../../services/licensing.service';
import { BrandingService, BrandingConfig } from '../../services/branding.service';
import { Stats, User } from '../../models/user.model';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit, OnDestroy {
  user: User | null = null;
  stats: Stats = {};
  loading = true;
  referralLink = '';
  showReferrerModal = false;
  licensingProgress: LicensingProgress | null = null;
  loadingLicensing = false;
  branding: BrandingConfig = { appName: 'Escape', appLogo: null };
  daysRemaining: number = 0;
  private timerInterval: any;

  constructor(
    public authService: AuthService,
    private agentService: AgentService,
    private adminService: AdminService,
    private licensingService: LicensingService,
    private brandingService: BrandingService
  ) { }

  ngOnInit(): void {
    this.user = this.authService.getCurrentUser();
    console.log('Current user:', this.user);
    console.log('User role:', this.user?.role);
    console.log('Is Admin:', this.authService.isAdmin());
    console.log('Is Agent:', this.authService.isAgent());
    
    // Load branding
    this.brandingService.branding$.subscribe(branding => {
      this.branding = branding;
    });
    
    this.loadStats();
    this.generateReferralLink();
    this.loadLicensingProgress();
  }

  loadLicensingProgress(): void {
    if (!this.user?._id || this.authService.isAdmin()) return;
    
    this.loadingLicensing = true;
    this.licensingService.getLicensingProgress(this.user._id).subscribe({
      next: (progress) => {
        this.licensingProgress = progress;
        this.loadingLicensing = false;
        this.startDaysRemainingTimer();
      },
      error: (error) => {
        console.error('Error loading licensing progress:', error);
        this.loadingLicensing = false;
      }
    });
  }

  startDaysRemainingTimer(): void {
    if (!this.licensingProgress?.licensingDeadline || this.licensingProgress?.isLicensed) {
      this.daysRemaining = 0;
      return;
    }

    // Calculate immediately
    this.calculateDaysRemaining();

    // Update every hour
    this.timerInterval = setInterval(() => {
      this.calculateDaysRemaining();
    }, 3600000); // 1 hour = 3600000ms
  }

  calculateDaysRemaining(): void {
    if (!this.licensingProgress?.licensingDeadline || this.licensingProgress?.isLicensed) {
      this.daysRemaining = 0;
      return;
    }

    const now = new Date();
    const deadline = new Date(this.licensingProgress.licensingDeadline);
    const diffTime = deadline.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    this.daysRemaining = diffDays > 0 ? diffDays : 0;
  }

  ngOnDestroy(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  getDaysRemainingColor(days: number): string {
    if (days <= 10) return 'text-danger';
    if (days <= 20) return 'text-warning';
    return 'text-success';
  }

  getDaysRemainingBadgeClass(days: number): string {
    if (days <= 10) return 'bg-danger';
    if (days <= 20) return 'bg-warning text-dark';
    return 'bg-success';
  }

  getLevelDisplay(level: string | undefined): string {
    if (!level) return 'Associate';
    return level.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  loadStats(): void {
    console.log('loadStats called');
    if (this.authService.isAdmin()) {
      console.log('Loading admin stats...');
      this.adminService.getStats().subscribe({
        next: (response) => {
          console.log('Admin stats response:', response);
          this.stats = response.stats;
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading admin stats:', error);
          this.loading = false;
        }
      });
    } else if (this.authService.isAgent()) {
      console.log('Loading agent stats...');
      this.agentService.getStats().subscribe({
        next: (response) => {
          console.log('Agent stats response:', response);
          this.stats = response.stats;
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading agent stats:', error);
          this.loading = false;
        }
      });
    } else {
      console.log('User is neither admin nor agent');
      this.loading = false;
    }
  }

  generateReferralLink(): void {
    const referralCode = this.user?.referralCode;
    console.log('Referral code:', referralCode);
    if (referralCode) {
      this.referralLink = `${window.location.origin}/apply?ref=${referralCode}`;
      console.log('Referral link:', this.referralLink);
    } else {
      console.warn('No referral code found for user');
    }
  }

  copyReferralLink(): void {
    navigator.clipboard.writeText(this.referralLink);
    alert('Referral link copied to clipboard!');
  }

  copyReferralCode(): void {
    const referralCode = this.user?.referralCode;
    if (referralCode) {
      navigator.clipboard.writeText(referralCode);
      alert('Referral code copied to clipboard!');
    }
  }

  showReferrerInfo(): void {
    this.showReferrerModal = true;
  }

  closeReferrerInfo(): void {
    this.showReferrerModal = false;
  }
}
