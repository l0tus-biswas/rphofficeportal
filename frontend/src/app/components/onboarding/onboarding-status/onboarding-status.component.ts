import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-onboarding-status',
  templateUrl: './onboarding-status.component.html',
  styleUrls: ['./onboarding-status.component.css']
})
export class OnboardingStatusComponent implements OnInit {
  application: any = null;
  loading: boolean = false;
  error: string = '';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadApplication();
  }

  loadApplication(): void {
    this.loading = true;
    this.error = '';
    
    this.http.get(`${environment.apiUrl}/user/apa-application`).subscribe({
      next: (response: any) => {
        this.application = response.application;
        this.loading = false;
      },
      error: (error) => {
        this.error = error.error?.message || 'Failed to load application';
        this.loading = false;
      }
    });
  }
}
