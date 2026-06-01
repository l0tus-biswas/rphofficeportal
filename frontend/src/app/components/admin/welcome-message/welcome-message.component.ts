import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-welcome-message',
  templateUrl: './welcome-message.component.html'
})
export class WelcomeMessageComponent implements OnInit {
  welcomeMsg: any = {
    enabled: false,
    title: '',
    message: '',
    videoUrl: '',
    imageUrl: '',
    pdfUrl: '',
    displayMode: 'until_dismissed',
    startDate: '',
    endDate: ''
  };

  loading = false;
  saving = false;
  resetting = false;
  uploading = false;
  success = '';
  error = '';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadConfig();
  }

  loadConfig(): void {
    this.loading = true;
    this.http.get<any>(`${environment.apiUrl}/admin/welcome-message`).subscribe({
      next: (res) => {
        if (res.config) {
          this.welcomeMsg = {
            enabled: res.config.enabled ?? false,
            title: res.config.title ?? '',
            message: res.config.message ?? '',
            videoUrl: res.config.videoUrl ?? '',
            imageUrl: res.config.imageUrl ?? '',
            pdfUrl: res.config.pdfUrl ?? '',
            displayMode: res.config.displayMode ?? 'until_dismissed',
            startDate: res.config.startDate ? res.config.startDate.substring(0, 10) : '',
            endDate: res.config.endDate ? res.config.endDate.substring(0, 10) : ''
          };
        }
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  saveConfig(): void {
    this.saving = true;
    this.success = '';
    this.error = '';
    this.http.put<any>(`${environment.apiUrl}/admin/welcome-message`, this.welcomeMsg).subscribe({
      next: (res) => {
        this.success = res.message || 'Welcome message saved!';
        this.saving = false;
        setTimeout(() => this.success = '', 4000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to save welcome message';
        this.saving = false;
      }
    });
  }

  resetUsers(): void {
    if (!confirm('Reset all users so they see the welcome message again?')) return;
    this.resetting = true;
    this.success = '';
    this.error = '';
    this.http.post<any>(`${environment.apiUrl}/admin/welcome-message/reset-users`, {}).subscribe({
      next: (res) => {
        this.success = res.message || 'All users reset!';
        this.resetting = false;
        setTimeout(() => this.success = '', 4000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to reset users';
        this.resetting = false;
      }
    });
  }

  uploadMedia(event: Event, type: 'image' | 'pdf'): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const formData = new FormData();
    formData.append(type, file);

    this.uploading = true;
    this.error = '';
    this.http.post<any>(`${environment.apiUrl}/admin/welcome-message/upload`, formData).subscribe({
      next: (res) => {
        if (res.imageUrl) this.welcomeMsg.imageUrl = res.imageUrl;
        if (res.pdfUrl) this.welcomeMsg.pdfUrl = res.pdfUrl;
        this.uploading = false;
        this.success = `${type === 'image' ? 'Image' : 'PDF'} uploaded successfully!`;
        setTimeout(() => this.success = '', 4000);
      },
      error: (err) => {
        this.error = err.error?.message || `Failed to upload ${type}`;
        this.uploading = false;
      }
    });
    input.value = '';
  }

  removeMedia(type: 'imageUrl' | 'pdfUrl'): void {
    this.welcomeMsg[type] = '';
  }
}
