import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { AgentService } from '../../services/agent.service';
import { AdminService } from '../../services/admin.service';
import { Stats, User } from '../../models/user.model';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  user: User | null = null;
  stats: Stats = {};
  loading = true;
  referralLink = '';
  showReferrerModal = false;

  constructor(
    public authService: AuthService,
    private agentService: AgentService,
    private adminService: AdminService
  ) { }

  ngOnInit(): void {
    this.user = this.authService.getCurrentUser();
    console.log('Current user:', this.user);
    console.log('User role:', this.user?.role);
    console.log('Is Admin:', this.authService.isAdmin());
    console.log('Is Agent:', this.authService.isAgent());
    this.loadStats();
    this.generateReferralLink();
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
