import { Component, OnInit } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { Router, NavigationEnd } from '@angular/router';
import { BrandingService } from './services/branding.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  title = 'RHP Office - Recruiting Platform';
  private currentBrandingName = 'RHP Office';

  constructor(
    private titleService: Title,
    private metaService: Meta,
    private router: Router,
    private brandingService: BrandingService
  ) {}

  ngOnInit(): void {
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
  }

  private updateMetaForRoute(url: string): void {
    const brandName = this.currentBrandingName;
    let title = `${brandName} - Recruiting Platform`;
    let description = `Join ${brandName}, the premier insurance agent recruiting platform.`;

    if (url.includes('/apply')) {
      title = `Apply Now - ${brandName} Recruiting`;
      description = 'Start your insurance career today. Complete your APA application and join our growing team of successful insurance agents.';
    } else if (url.includes('/login')) {
      title = `Agent Login - ${brandName}`;
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
