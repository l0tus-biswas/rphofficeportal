import { Component, OnInit, OnDestroy } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { Router, NavigationEnd } from '@angular/router';
import { BrandingService } from './services/branding.service';
import { BroadcastService } from './services/broadcast.service';
import { BroadcastPopupService } from './services/broadcast-popup.service';
import { SocketService } from './services/socket.service';
import { TimezoneService } from './services/timezone.service';
import { AuthService } from './services/auth.service';
import { TranslationService } from './services/translation.service';
import { filter } from 'rxjs/operators';
import { Observable, Subscription } from 'rxjs';
import { User } from './models/user.model';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'RHP Office - Recruiting Platform';
  private currentBrandingName = 'RHP Office';
  private broadcastSubscription?: Subscription;
  private broadcastQueueSubscription?: Subscription;

  // Impersonation banner state
  isImpersonating$: Observable<boolean>;
  currentUser$: Observable<User | null>;
  exitingImpersonation = false;

  constructor(
    private titleService: Title,
    private metaService: Meta,
    private router: Router,
    private brandingService: BrandingService,
    private broadcastService: BroadcastService,
    private broadcastPopupService: BroadcastPopupService,
    private socketService: SocketService,
    private timezoneService: TimezoneService,
    private authService: AuthService,
    private translationService: TranslationService
  ) {
    this.isImpersonating$ = this.authService.isImpersonating$;
    this.currentUser$ = this.authService.currentUser$;
  }

  exitImpersonation(): void {
    this.exitingImpersonation = true;
    this.authService.stopImpersonation().subscribe({
      next: () => {
        // Reload so every service rebinds to the restored admin session
        this.router.navigate(['/admin/users']).then(() => window.location.reload());
      },
      error: () => {
        this.exitingImpersonation = false;
      }
    });
  }

  ngOnInit(): void {
    // Initialize once at the app root so translation persists across every route
    this.translationService.init();

    // Subscribe to branding changes and update title and favicon dynamically
    this.brandingService.branding$.subscribe(branding => {
      this.currentBrandingName = branding.appName;
      const pageTitle = `${branding.appName} - Recruiting Platform`;
      this.titleService.setTitle(pageTitle);
      
      // Update meta tags with branding
      this.metaService.updateTag({ property: 'og:title', content: `${branding.appName} - Insurance Agent Recruiting Platform` });
      this.metaService.updateTag({ property: 'og:site_name', content: branding.appName });
      this.metaService.updateTag({ name: 'twitter:title', content: `${branding.appName} - Insurance Agent Recruiting Platform` });
      this.metaService.updateTag({ name: 'apple-mobile-web-app-title', content: branding.appName });
      
      // Update favicon if logo exists
      if (branding.appLogo) {
        this.updateFavicon(branding.appLogo);
        this.metaService.updateTag({ property: 'og:image', content: branding.appLogo });
        this.metaService.updateTag({ name: 'twitter:image', content: branding.appLogo });
      }
      
      // Re-update title for current route with new branding
      this.updateMetaForRoute(this.router.url);
    });

    // Update meta tags based on route changes
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.updateMetaForRoute(event.url);
    });

    // Listen for new broadcasts and trigger popup
    this.broadcastSubscription = this.broadcastService.newBroadcast$.subscribe(broadcast => {
      if (broadcast) {
        this.broadcastPopupService.showBroadcastPopup(broadcast);
      }
    });

    // Listen for queued broadcasts (multiple unread) and display them sequentially
    this.broadcastQueueSubscription = this.broadcastService.newBroadcastQueue$.subscribe(broadcasts => {
      if (broadcasts && broadcasts.length > 0) {
        this.broadcastPopupService.showBroadcastQueue(broadcasts);
      }
    });
  }

  ngOnDestroy(): void {
    this.broadcastSubscription?.unsubscribe();
    this.broadcastQueueSubscription?.unsubscribe();
  }

  private updateMetaForRoute(url: string): void {
    const brandName = this.currentBrandingName;
    let title = `${brandName} - Recruiting Platform`;
    let description = `Join ${brandName}, the premier insurance agent recruiting platform.`;

    if (url.includes('/apply')) {
      title = `Apply Now - ${brandName} Recruiting`;
      description = 'Start your insurance career today. Complete your APA application and join our growing team of successful insurance agents.';
    } else if (url.includes('/login')) {
      title = `Sign In - ${brandName}`;
      description = `Access your ${brandName} agent portal. Manage your downline, track production, and access training resources.`;
    } else if (url.includes('/dashboard')) {
      title = `Dashboard - ${brandName}`;
      description = 'Your agent dashboard. View stats, manage recruits, and track your success.';
    } else if (url.includes('/training')) {
      title = `Training Resources - ${brandName}`;
      description = 'Access comprehensive insurance sales training, product knowledge, and business building resources.';
    } else if (url.includes('/licensing')) {
      title = `Licensing Support - ${brandName}`;
      description = 'Get support with your insurance licensing process. Track your progress and access study materials.';
    }

    this.titleService.setTitle(title);
    this.metaService.updateTag({ name: 'description', content: description });
    this.metaService.updateTag({ property: 'og:description', content: description });
    this.metaService.updateTag({ name: 'twitter:description', content: description });
  }

  private updateFavicon(logoUrl: string): void {
    // Remove existing favicon
    const existingFavicon = document.querySelector("link[rel*='icon']");
    if (existingFavicon) {
      existingFavicon.remove();
    }

    // Add new favicon
    const link: HTMLLinkElement = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/x-icon';
    link.href = logoUrl;
    document.head.appendChild(link);
  }
}
