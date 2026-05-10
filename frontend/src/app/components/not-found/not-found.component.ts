import { Component } from '@angular/core';

@Component({
  selector: 'app-not-found',
  template: `
    <div class="container d-flex align-items-center justify-content-center" style="min-height: 80vh;">
      <div class="text-center">
        <h1 class="display-1 fw-bold text-muted">404</h1>
        <h3 class="mb-3">Page Not Found</h3>
        <p class="text-muted mb-4">The page you're looking for doesn't exist or has been moved.</p>
        <a routerLink="/dashboard" class="btn btn-primary">
          <i class="bi bi-house me-2"></i>Go to Dashboard
        </a>
      </div>
    </div>
  `
})
export class NotFoundComponent {}
