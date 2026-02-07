import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PublicService } from '../../services/public.service';

@Component({
  selector: 'app-application-success',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="success-container" *ngIf="!loading; else loadingState">
      <div class="success-card">
        <div class="success-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        </div>

        <h1 class="success-title">✓ Application Submitted Successfully!</h1>

        <p class="greeting" *ngIf="applicantName; else defaultGreeting">Dear {{ applicantName }},</p>
        <ng-template #defaultGreeting>
          <p class="greeting">Dear Applicant,</p>
        </ng-template>

        <p class="thank-you">Thank you for submitting your Agent Producer Agreement (APA) application.</p>

        <div class="status-banner error" *ngIf="loadError">
          {{ loadError }}
        </div>

        <ng-container *ngIf="!loadError">
          <div class="launch-section">
            <h2 class="section-title">📧 Launch your DocuSign packet</h2>
            <p class="instruction-text">
              Confirm or correct the signing email before sending the agreement. DocuSign will email the recruit within minutes after you send it.
            </p>

            <div class="email-control">
              <label for="signingEmail">Signing email</label>
              <div class="email-row">
                <input
                  id="signingEmail"
                  type="email"
                  [(ngModel)]="emailInput"
                  [readOnly]="!editingEmail || hasSentDocuSign"
                  [class.invalid]="!!emailError"
                />
                <button
                  *ngIf="!editingEmail && !hasSentDocuSign"
                  type="button"
                  class="link-button"
                  (click)="enableEmailEdit()"
                >
                  Edit email
                </button>
              </div>

              <div class="edit-actions" *ngIf="editingEmail && !hasSentDocuSign">
                <button type="button" class="btn-secondary subtle" (click)="cancelEmailEdit()">Cancel</button>
                <button type="button" class="btn-primary subtle" (click)="lockEmail()">Save</button>
              </div>

              <p class="support-text" *ngIf="hasSentDocuSign">
                DocuSign sent to {{ emailInput }}<span *ngIf="sentAt"> on {{ sentAt | date:'short' }}</span>.
              </p>
              <p class="support-text" *ngIf="!hasSentDocuSign">
                We'll send the DocuSign email as soon as you click the button below.
              </p>
              <p class="error-text" *ngIf="emailError">{{ emailError }}</p>
            </div>

            <button
              class="btn-primary launch"
              type="button"
              (click)="sendDocuSign()"
              [disabled]="sending || hasSentDocuSign"
            >
              <span *ngIf="sending">Sending…</span>
              <span *ngIf="!sending && !hasSentDocuSign">Send DocuSign</span>
              <span *ngIf="!sending && hasSentDocuSign">DocuSign Sent</span>
            </button>

            <div class="status-banner success" *ngIf="sendSuccess">
              {{ sendSuccess }}
            </div>
            <div class="status-banner error" *ngIf="sendError">
              {{ sendError }}
            </div>
            
            <!-- Payment Button - Show after DocuSign is sent -->
            <div class="payment-section" *ngIf="hasSentDocuSign">
              <button 
                class="btn-payment" 
                type="button"
                (click)="goToPayment()"
              >
                💳 Complete Payment ($20/month)
              </button>
              <p class="payment-note">
                <strong>Important:</strong> Please sign the APA agreement in your email first, then complete the payment to activate your account.
              </p>
            </div>
          </div>

          <div class="timeline-box">
            <h3 class="timeline-title">📋 What Happens Next?</h3>
            <ol class="timeline-list">
              <li>
                <span class="timeline-step">Step 1:</span>
                <span class="timeline-text">Confirm the email above and click <strong>Send DocuSign</strong></span>
              </li>
              <li>
                <span class="timeline-step">Step 2:</span>
                <span class="timeline-text">Review and sign the agreement from the DocuSign email</span>
              </li>
              <li>
                <span class="timeline-step">Step 3:</span>
                <span class="timeline-text">After signing, watch for a payment setup email from us</span>
              </li>
              <li>
                <span class="timeline-step">Step 4:</span>
                <span class="timeline-text">Complete payment to activate your RHP Office account</span>
              </li>
            </ol>
          </div>

          <div class="note-box">
            <p class="note-text">
              <strong>Tip:</strong> If you close this page before sending DocuSign, contact your recruiter with your application ID so we can re-open the launch screen.
            </p>
          </div>

          <div class="app-id" *ngIf="applicationId">
            <p><strong>Application ID:</strong> <code>{{ applicationId }}</code></p>
          </div>

          <div class="action-buttons">
            <button class="btn-primary" (click)="goToLogin()">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="btn-icon">
                <path d="M11 7L9.6 8.4l2.6 2.6H2v2h10.2l-2.6 2.6L11 17l5-5-5-5zm9 12h-8v2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-8v2h8v14z"/>
              </svg>
              Go to Login
            </button>
            <button class="btn-secondary" (click)="goToHome()">
              Return to Home
            </button>
          </div>

          <p class="help-text">
            Need to resend the link or change the email later? Contact your recruiter and share your application ID.
          </p>
        </ng-container>
      </div>
    </div>

    <ng-template #loadingState>
      <div class="success-container">
        <div class="success-card loading-card">
          <div class="spinner"></div>
          <p>Loading your application...</p>
        </div>
      </div>
    </ng-template>
  `,
  styles: [`
    .success-container {
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }

    .success-card {
      background: #fff;
      border-radius: 20px;
      box-shadow: 0 25px 60px rgba(15, 23, 42, 0.3);
      max-width: 760px;
      width: 100%;
      padding: 3rem;
      animation: rise 0.5s ease-out;
      position: relative;
    }

    @keyframes rise {
      from { opacity: 0; transform: translateY(30px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .success-icon {
      width: 80px;
      height: 80px;
      margin: 0 auto 1.5rem;
      color: #4caf50;
    }

    .success-title {
      color: #0f172a;
      font-size: 2rem;
      font-weight: 700;
      margin: 0 0 1rem;
      text-align: center;
    }

    .greeting {
      font-size: 1.125rem;
      color: #1f2937;
      margin: 1rem 0;
      text-align: center;
    }

    .thank-you {
      color: #4b5563;
      font-size: 1rem;
      margin: 0 0 1.75rem;
      text-align: center;
    }

    .section-title {
      color: #0f172a;
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0 0 0.75rem;
    }

    .instruction-text {
      color: #475467;
      margin: 0;
      line-height: 1.5;
    }

    .launch-section {
      background: #f8f9fb;
      border: 1px solid #e4e9f2;
      border-radius: 16px;
      padding: 1.75rem;
      margin-bottom: 2rem;
    }

    .email-control {
      margin-top: 1.5rem;
    }

    .email-control label {
      font-size: 0.95rem;
      font-weight: 600;
      color: #3f3d56;
      display: block;
      margin-bottom: 0.5rem;
    }

    .email-row {
      display: flex;
      gap: 0.75rem;
      align-items: center;
    }

    .email-row input {
      flex: 1;
      padding: 0.9rem 1rem;
      border-radius: 10px;
      border: 1px solid #d1d5db;
      font-size: 1rem;
      transition: border 0.2s ease, box-shadow 0.2s ease;
    }

    .email-row input:focus {
      outline: none;
      border-color: #4c8bf5;
      box-shadow: 0 0 0 3px rgba(76, 139, 245, 0.2);
    }

    .email-row input[readonly] {
      background: #f3f4f6;
      cursor: not-allowed;
    }

    .email-row input.invalid {
      border-color: #dc2626;
    }

    .link-button {
      background: none;
      border: none;
      color: #1d4ed8;
      font-weight: 600;
      cursor: pointer;
      padding: 0;
    }

    .link-button:hover {
      text-decoration: underline;
    }

    .edit-actions {
      margin-top: 0.75rem;
      display: flex;
      gap: 0.5rem;
    }

    .btn-primary.subtle,
    .btn-secondary.subtle {
      padding: 0.5rem 1.25rem;
      font-size: 0.85rem;
      min-width: auto;
    }

    .btn-secondary.subtle {
      border-width: 1px;
    }

    .btn-primary.launch {
      width: 100%;
      margin-top: 1.5rem;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    .support-text {
      color: #64748b;
      font-size: 0.9rem;
      margin: 0.75rem 0 0;
    }

    .error-text {
      color: #b91c1c;
      font-size: 0.9rem;
      margin-top: 0.5rem;
    }

    .status-banner {
      margin-top: 1rem;
      padding: 0.85rem 1rem;
      border-radius: 10px;
      font-size: 0.95rem;
    }

    .status-banner.success {
      background: #ecfdf5;
      color: #047857;
      border: 1px solid #a7f3d0;
    }

    .status-banner.error {
      background: #fef2f2;
      color: #b91c1c;
      border: 1px solid #fecaca;
    }

    .payment-section {
      margin-top: 1.5rem;
      padding-top: 1.5rem;
      border-top: 2px solid #e5e7eb;
    }

    .btn-payment {
      width: 100%;
      padding: 1.25rem 2rem;
      border: none;
      border-radius: 12px;
      font-size: 1.125rem;
      font-weight: 600;
      color: #fff;
      background: linear-gradient(135deg, #10b981, #059669);
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
      margin-bottom: 1rem;
    }

    .btn-payment:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 25px rgba(16, 185, 129, 0.4);
    }

    .btn-payment:active {
      transform: translateY(0);
    }

    .payment-note {
      text-align: center;
      color: #6b7280;
      font-size: 0.875rem;
      margin: 0;
      line-height: 1.6;
    }

    .payment-note strong {
      color: #dc2626;
    }

    .timeline-box {
      background: #eef4ff;
      border: 1px solid #c7d7fe;
      border-radius: 16px;
      padding: 1.75rem;
      margin-bottom: 1.5rem;
    }

    .timeline-title {
      color: #1d4ed8;
      font-size: 1.125rem;
      font-weight: 600;
      margin: 0 0 1rem;
    }

    .timeline-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .timeline-list li {
      display: flex;
      gap: 0.75rem;
      color: #1d4ed8;
      line-height: 1.4;
    }

    .timeline-step {
      font-weight: 600;
      white-space: nowrap;
    }

    .timeline-text {
      flex: 1;
    }

    .note-box {
      background: #f1f8e9;
      border: 1px solid #c5e1a5;
      border-radius: 12px;
      padding: 1rem 1.5rem;
      margin-bottom: 1.5rem;
    }

    .note-text {
      margin: 0;
      color: #2f6b1c;
      line-height: 1.6;
    }

    .app-id {
      text-align: center;
      padding: 1rem;
      background: #f9fafb;
      border-radius: 10px;
      margin-bottom: 1.5rem;
    }

    .app-id code {
      background: #e5e7eb;
      padding: 4px 10px;
      border-radius: 6px;
      font-family: 'Courier New', monospace;
      color: #111827;
    }

    .action-buttons {
      display: flex;
      gap: 1rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }

    .btn-primary,
    .btn-secondary {
      flex: 1;
      min-width: 200px;
      padding: 1rem 2rem;
      border-radius: 10px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }

    .btn-primary {
      border: none;
      color: #fff;
      background: linear-gradient(135deg, #22c55e, #16a34a);
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 25px rgba(34, 197, 94, 0.35);
    }

    .btn-secondary {
      border: 2px solid #e5e7eb;
      background: #fff;
      color: #111827;
    }

    .btn-secondary:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 25px rgba(15, 23, 42, 0.1);
    }

    .btn-icon {
      width: 20px;
      height: 20px;
    }

    .help-text {
      text-align: center;
      color: #6b7280;
      font-size: 0.9rem;
      margin: 0;
      line-height: 1.5;
    }

    .status-banner.error,
    .status-banner.success {
      font-weight: 500;
    }

    .status-banner.error svg,
    .status-banner.success svg {
      flex-shrink: 0;
    }

    .status-banner.error svg path,
    .status-banner.success svg path {
      fill: currentColor;
    }

    .status-banner.error,
    .status-banner.success {
      display: block;
    }

    .status-banner.error:empty,
    .status-banner.success:empty {
      display: none;
    }

    .loading-card {
      text-align: center;
    }

    .spinner {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      border: 4px solid rgba(255, 255, 255, 0.3);
      border-top-color: #22c55e;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .status-banner.error,
    .status-banner.success,
    .support-text,
    .error-text {
      word-break: break-word;
    }

    @media (max-width: 768px) {
      .success-container {
        padding: 1rem;
      }

      .success-card {
        padding: 2rem 1.5rem;
      }

      .email-row {
        flex-direction: column;
        align-items: stretch;
      }

      .link-button {
        align-self: flex-start;
      }

      .action-buttons {
        flex-direction: column;
      }

      .btn-primary,
      .btn-secondary {
        width: 100%;
        min-width: unset;
      }
    }
  `]
})
export class ApplicationSuccessComponent implements OnInit {
  applicationId: string | null = null;
  applicantName: string | null = null;
  loading = false;
  loadError = '';
  emailInput = '';
  initialEmail = '';
  editingEmail = false;
  emailError = '';
  docusignStatus = 'draft';
  sentAt: string | null = null;
  sending = false;
  sendError = '';
  sendSuccess = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private publicService: PublicService
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.applicationId = params['applicationId'] || null;
      this.applicantName = params['name'] || null;

      if (this.applicationId) {
        this.fetchApplication();
      } else {
        this.loadError = 'Application not found. Please contact your recruiter.';
      }
    });
  }

  get hasSentDocuSign(): boolean {
    const status = (this.docusignStatus || '').toLowerCase();
    return ['sent', 'delivered', 'signed', 'completed'].includes(status);
  }

  fetchApplication(): void {
    if (!this.applicationId) {
      return;
    }

    this.loading = true;
    this.loadError = '';
    this.publicService.getAPAApplicationStatus(this.applicationId).subscribe({
      next: response => {
        this.loading = false;
        const app = response?.application || {};
        this.emailInput = app.personalInfo?.email || '';
        this.initialEmail = this.emailInput;
        this.docusignStatus = app.docusign?.status || app.docusignStatus || 'draft';
        this.sentAt = app.docusign?.sentAt || null;
        this.editingEmail = false;

        if (this.hasSentDocuSign) {
          this.sendSuccess = 'DocuSign email already sent. Check your inbox for the signing link.';
        }
      },
      error: error => {
        this.loading = false;
        this.loadError = error.error?.message || 'Unable to load your application. Please contact support.';
      }
    });
  }

  enableEmailEdit(): void {
    if (this.hasSentDocuSign) {
      return;
    }
    this.emailError = '';
    this.editingEmail = true;
  }

  cancelEmailEdit(): void {
    this.emailInput = this.initialEmail;
    this.emailError = '';
    this.editingEmail = false;
  }

  lockEmail(): void {
    if (this.hasSentDocuSign) {
      this.editingEmail = false;
      return;
    }
    const normalized = (this.emailInput || '').trim();
    if (!this.validateEmail(normalized)) {
      this.emailError = 'Enter a valid email before saving.';
      return;
    }
    this.emailInput = normalized.toLowerCase();
    this.initialEmail = this.emailInput;
    this.emailError = '';
    this.editingEmail = false;
  }

  sendDocuSign(): void {
    if (!this.applicationId) {
      this.sendError = 'Missing application ID. Please contact your recruiter.';
      return;
    }

    if (this.hasSentDocuSign) {
      this.sendSuccess = 'DocuSign email already sent.';
      return;
    }

    const normalized = (this.emailInput || '').trim().toLowerCase();
    if (!this.validateEmail(normalized)) {
      this.emailError = 'Please enter a valid email before sending.';
      return;
    }

    this.emailError = '';
    this.sendError = '';
    this.sendSuccess = '';
    this.sending = true;

    this.publicService.launchDocuSign(this.applicationId, normalized).subscribe({
      next: response => {
        this.sending = false;
        this.emailInput = response.email || normalized;
        this.initialEmail = this.emailInput;
        this.docusignStatus = response.docusign?.status || 'sent';
        this.sentAt = response.docusign?.sentAt || null;
        this.editingEmail = false;
        this.sendSuccess = 'DocuSign email sent! Please check your inbox (and spam folder).';
      },
      error: error => {
        this.sending = false;
        this.sendError = error.error?.message || 'Failed to send DocuSign. Please try again.';
      }
    });
  }

  private validateEmail(value: string): boolean {
    if (!value) {
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }

  goToHome(): void {
    this.router.navigate(['/']);
  }

  goToPayment(): void {
    if (this.applicationId) {
      this.router.navigate(['/apa-payment'], {
        queryParams: { applicationId: this.applicationId }
      });
    }
  }
}
