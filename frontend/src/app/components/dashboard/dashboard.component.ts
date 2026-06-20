import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AuthService } from '../../services/auth.service';
import { AgentService } from '../../services/agent.service';
import { AdminService } from '../../services/admin.service';
import { LicensingService, LicensingProgress } from '../../services/licensing.service';
import { BrandingService, BrandingConfig } from '../../services/branding.service';
import { Stats, User } from '../../models/user.model';
import { environment } from '../../../environments/environment';

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
  branding: BrandingConfig = { appName: 'RHP Office', appLogo: null };
  daysRemaining: number = 0;
  private timerInterval: any;

  // Welcome Message
  showWelcomeModal = false;
  welcomeTitle = '';
  welcomeMessage = '';
  welcomeVideoUrl = '';
  welcomeVideoEmbedUrl: SafeResourceUrl | null = null;
  welcomeVideoIsFile = false;
  welcomeImageUrl = '';
  welcomePdfUrl = '';

  constructor(
    public authService: AuthService,
    private agentService: AgentService,
    private adminService: AdminService,
    private licensingService: LicensingService,
    private brandingService: BrandingService,
    private router: Router,
    private http: HttpClient,
    private sanitizer: DomSanitizer
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
    this.loadWelcomeMessage();
  }

  loadWelcomeMessage(): void {
    if (!this.authService.isAgent() || this.authService.isAdmin()) return;
    this.http.get<any>(`${environment.apiUrl}/agent/welcome-message`).subscribe({
      next: (res) => {
        if (res.show) {
          this.welcomeTitle = res.title || '';
          this.welcomeMessage = res.message || '';
          this.welcomeVideoUrl = res.videoUrl || '';
          this.setWelcomeVideo(this.welcomeVideoUrl);
          this.welcomeImageUrl = res.imageUrl || '';
          this.welcomePdfUrl = res.pdfUrl || '';
          this.showWelcomeModal = true;
        }
      },
      error: () => {}
    });
  }

  /**
   * Normalizes any pasted video link into something that actually plays inside
   * the popup. Handles YouTube watch/short/embed URLs, Vimeo, Loom, and direct
   * video files (mp4/webm/etc). Without this, pasting a normal YouTube "watch"
   * URL into an iframe produces a blank/broken area (YouTube blocks watch pages
   * from being framed).
   */
  setWelcomeVideo(rawUrl: string): void {
    this.welcomeVideoEmbedUrl = null;
    this.welcomeVideoIsFile = false;

    const url = (rawUrl || '').trim();
    if (!url) return;

    // Direct video file → play with native <video> element
    if (/\.(mp4|webm|ogg|ogv|mov|m4v)(\?.*)?$/i.test(url)) {
      this.welcomeVideoIsFile = true;
      this.welcomeVideoEmbedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
      return;
    }

    let embedUrl = url;

    // YouTube: watch (?v=), short (youtu.be/), or already-embed URL
    const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (ytMatch) {
      embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}?rel=0&modestbranding=1`;
    } else {
      // Loom share URL
      const loomMatch = url.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
      if (loomMatch) {
        embedUrl = `https://www.loom.com/embed/${loomMatch[1]}`;
      } else {
        // Vimeo
        const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
        if (vimeoMatch) {
          embedUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
        }
        // Any other URL: use as-is in the iframe
      }
    }

    this.welcomeVideoEmbedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl);
  }

  dismissWelcomeMessage(): void {
    this.showWelcomeModal = false;
    this.http.post<any>(`${environment.apiUrl}/agent/welcome-message/dismiss`, {}).subscribe();
  }

  loadLicensingProgress(): void {
    if (!this.user?._id || this.authService.isAdmin()) return;
    
    this.loadingLicensing = true;
    this.licensingService.getLicensingProgress(this.user._id).subscribe({
      next: (progress) => {
        this.licensingProgress = progress;
        console.log('Licensing Progress loaded:', progress);
        console.log('License Types:', progress.licenseTypes);
        console.log('Has existing license?', this.hasExistingLicense());
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
    // Don't show timer if user is already licensed (answered "Yes" and selected any license type)
    if (!this.licensingProgress?.licensingDeadline || 
        this.licensingProgress?.isLicensed ||
        this.hasExistingLicense()) {
      this.daysRemaining = 0;
      return;
    }

    // Calculate immediately
    this.calculateDaysRemaining();

    // Calculate milliseconds until next midnight Eastern Time
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    // Update at midnight, then every 24 hours
    setTimeout(() => {
      this.calculateDaysRemaining();
      this.timerInterval = setInterval(() => {
        this.calculateDaysRemaining();
      }, 86400000); // 24 hours = 86400000ms
    }, msUntilMidnight);
  }

  calculateDaysRemaining(): void {
    if (!this.licensingProgress?.licensingDeadline || 
        this.licensingProgress?.isLicensed ||
        this.hasExistingLicense()) {
      this.daysRemaining = 0;
      return;
    }

    // Calculate days from start of today to deadline
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const deadline = new Date(this.licensingProgress.licensingDeadline);
    deadline.setHours(0, 0, 0, 0);
    const diffTime = deadline.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    this.daysRemaining = diffDays > 0 ? diffDays : 0;
  }

  hasExistingLicense(): boolean {
    // If user answered "Yes" to currently licensed and selected any license type, hide timer
    return (this.licensingProgress?.licenseTypes?.length || 0) > 0;
  }

  // Licensed via a self-reported / pre-existing license rather than by completing
  // RHP's internal pipeline (no pipeline-completion date). Keeps the dashboard
  // message honest — they didn't "complete all licensing requirements".
  isSelfReportedLicense(): boolean {
    return !!this.licensingProgress?.isLicensed && !this.licensingProgress?.licenseObtainedDate;
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

  // §25.6 — Navigate to a section when clicking a metric card
  navigateTo(route: string): void {
    this.router.navigate([route]);
  }

  // §25.3 — Time ago display for activity feed
  timeAgo(dateStr: string): string {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return `${Math.floor(diffHrs / 24)}d ago`;
  }

  // §25.5 — Alert type badge
  getAlertBadgeClass(type: string): string {
    const map: { [key: string]: string } = {
      'apa_submitted': 'bg-info',
      'apa_approved': 'bg-success',
      'apa_rejected': 'bg-danger',
      'new_agent_registered': 'bg-primary',
      'production_submitted': 'bg-warning text-dark',
      'production_in_force': 'bg-success',
      'promotion_eligible': 'bg-info',
      'carrier_contract_requested': 'bg-secondary',
      'document_submitted': 'bg-primary',
      'admin_broadcast': 'bg-dark',
      'system_announcement': 'bg-dark'
    };
    return map[type] || 'bg-secondary';
  }
}
