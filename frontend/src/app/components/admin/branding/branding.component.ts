import { Component, OnInit } from '@angular/core';
import { BrandingService } from '../../../services/branding.service';

@Component({
  selector: 'app-branding',
  templateUrl: './branding.component.html',
  styleUrls: ['./branding.component.css']
})
export class BrandingComponent implements OnInit {
  appName: string = '';
  appLogo: string | null = null;
  selectedFile: File | null = null;
  previewUrl: string | null = null;
  loading: boolean = false;
  successMessage: string = '';
  errorMessage: string = '';

  constructor(private brandingService: BrandingService) {}

  ngOnInit(): void {
    this.loadBranding();
  }

  loadBranding(): void {
    this.brandingService.getBranding().subscribe({
      next: (response) => {
        this.appName = response.appName || 'Escape';
        if (response.appLogo) {
          this.appLogo = `http://localhost:5000${response.appLogo}`;
        }
      },
      error: (error) => {
        this.errorMessage = 'Failed to load branding configuration';
        console.error('Error loading branding:', error);
      }
    });
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.match(/image\/(jpeg|jpg|png|gif|svg\+xml)/)) {
        this.errorMessage = 'Only image files (JPEG, PNG, GIF, SVG) are allowed';
        return;
      }

      // Validate file size (2MB)
      if (file.size > 2 * 1024 * 1024) {
        this.errorMessage = 'File size must be less than 2MB';
        return;
      }

      this.selectedFile = file;
      this.errorMessage = '';

      // Create preview
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.previewUrl = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  saveBranding(): void {
    if (!this.appName.trim() && !this.selectedFile) {
      this.errorMessage = 'Please provide at least app name or logo';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const formData = new FormData();
    if (this.appName.trim()) {
      formData.append('appName', this.appName.trim());
    }
    if (this.selectedFile) {
      formData.append('logo', this.selectedFile);
    }

    this.brandingService.updateBranding(formData).subscribe({
      next: (response) => {
        this.successMessage = 'Branding updated successfully!';
        this.loading = false;
        this.selectedFile = null;
        this.previewUrl = null;
        this.loadBranding();
        
        // Clear success message after 3 seconds
        setTimeout(() => {
          this.successMessage = '';
        }, 3000);
      },
      error: (error) => {
        this.errorMessage = error.error?.message || 'Failed to update branding';
        this.loading = false;
        console.error('Error updating branding:', error);
      }
    });
  }

  clearLogo(): void {
    this.selectedFile = null;
    this.previewUrl = null;
  }
}
