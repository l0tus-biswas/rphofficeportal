import { Component, OnInit, OnDestroy } from '@angular/core';
import { AuthService } from '../../../services/auth.service';
import { BrandingService, BrandingConfig } from '../../../services/branding.service';
import { NotificationService } from '../../../services/notification.service';
import { Subscription } from 'rxjs';

declare var google: any;

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

  initGoogleTranslate(): void {
    console.log('Attempting to initialize Google Translate...');
    
    const checkAndInit = () => {
      const targetElement = document.getElementById('google_translate_element');
      console.log('Target element exists:', !!targetElement);
      console.log('Google available:', typeof google !== 'undefined');
      console.log('Google translate available:', typeof google !== 'undefined' && google.translate);
      
      if (!targetElement) {
        console.error('google_translate_element div not found in DOM');
        return;
      }
      
      if (typeof google !== 'undefined' && google.translate && google.translate.TranslateElement) {
        try {
          console.log('Creating TranslateElement...');
          
          // Clear any existing content
          targetElement.innerHTML = '';
          
          new google.translate.TranslateElement(
            {
              pageLanguage: 'en',
              includedLanguages: 'en,es',
              autoDisplay: false,
              multilanguagePage: true
            },
            'google_translate_element'
          );
          
          console.log('TranslateElement created successfully');
          
          // Wait for select element to appear and restore saved language
          const waitForSelect = (attempts = 0) => {
            const selectElement = document.querySelector('.goog-te-combo') as HTMLSelectElement;
            const gadgetElement = document.querySelector('.goog-te-gadget');
            console.log(`Attempt ${attempts + 1}:`);
            console.log('  - Select element found:', !!selectElement);
            console.log('  - Gadget element found:', !!gadgetElement);
            console.log('  - Target element children:', targetElement.children.length);
            
            if (selectElement) {
              console.log('✓ Google Translate dropdown is now visible!');
              const savedLang = localStorage.getItem('selectedLanguage');
              console.log('Saved language:', savedLang);
              
              if (savedLang && savedLang !== 'en') {
                selectElement.value = savedLang;
                selectElement.dispatchEvent(new Event('change'));
              }
              
              // Add change listener to save language
              selectElement.addEventListener('change', (e: any) => {
                console.log('Language changed to:', e.target.value);
                localStorage.setItem('selectedLanguage', e.target.value);
              });
            } else if (attempts < 15) {
              // Retry up to 15 times (7.5 seconds total)
              setTimeout(() => waitForSelect(attempts + 1), 500);
            } else {
              console.error('Could not find Google Translate select element after 15 attempts');
              console.log('Target element HTML:', targetElement.innerHTML);
            }
          };
          
          setTimeout(() => waitForSelect(), 1000);
        } catch (error) {
          console.error('Error initializing Google Translate:', error);
        }
      } else {
        console.log('Google Translate not yet available, retrying...');
        setTimeout(checkAndInit, 500);
      }
    };
    
    checkAndInit();
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
