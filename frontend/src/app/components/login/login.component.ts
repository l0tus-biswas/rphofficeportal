import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { BrandingService, BrandingConfig } from '../../services/branding.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {
  loginForm!: FormGroup;
  loading = false;
  error = '';
  showPassword = false;
  maintenanceMode = false;
  maintenanceMessage = 'RHP Office is temporarily under maintenance. Please check back shortly.';
  returnUrl = '/dashboard';
  branding: BrandingConfig = { appName: 'RHP Office', appLogo: null };

  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute,
    private brandingService: BrandingService
  ) { }

  ngOnInit(): void {
    // Redirect if already logged in
    if (this.authService.isLoggedIn()) {
      this.router.navigate(['/dashboard']);
    }

    // Load branding - get current value immediately
    this.branding = this.brandingService.getCurrentBranding();
    
    // Subscribe for future updates
    this.brandingService.branding$.subscribe(branding => {
      this.branding = branding;
    });

    this.loginForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });

    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/dashboard';

    const maintenanceMessageParam = this.route.snapshot.queryParams['maintenanceMessage'];
    if (maintenanceMessageParam) {
      this.maintenanceMode = true;
      this.maintenanceMessage = maintenanceMessageParam;
    }

    this.checkSiteAccess();
  }

  checkSiteAccess(): void {
    this.http.get<any>(`${environment.apiUrl}/public/site-access`).subscribe({
      next: (response) => {
        const enabled = response?.siteAccessEnabled ?? response?.data?.siteAccessEnabled;
        const message = response?.siteAccessMessage ?? response?.data?.siteAccessMessage;
        this.maintenanceMode = enabled === false;
        if (message) {
          this.maintenanceMessage = message;
        }
      },
      error: () => {
        // Fail open on UI; backend still enforces access.
      }
    });
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      return;
    }

    this.loading = true;
    this.error = '';

    this.authService.login(this.loginForm.value).subscribe({
      next: (response) => {
        this.router.navigate([this.returnUrl]);
      },
      error: (error) => {
        if (error.status === 503 && error.error?.maintenanceMode) {
          this.maintenanceMode = true;
          this.maintenanceMessage = error.error?.message || this.maintenanceMessage;
        }
        this.error = error.error?.message || 'Login failed. Please try again.';
        this.loading = false;
      }
    });
  }

  get f() {
    return this.loginForm.controls;
  }
}
