import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-application-success',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="success-container">
      <div class="success-card">
        <!-- Success Icon -->
        <div class="success-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        </div>

        <!-- Success Header -->
        <h1 class="success-title">✓ Application Submitted Successfully!</h1>
        
        <p class="greeting" *ngIf="applicantName">Dear {{ applicantName }},</p>
        <p class="greeting" *ngIf="!applicantName">Dear Applicant,</p>
        
        <p class="thank-you">Thank you for submitting your Agent Producer Agreement (APA) application.</p>

        <!-- Next Steps Section -->
        <div class="next-steps-section">
          <h2 class="section-title">📧 Next Step: Sign Your Agreement</h2>
          <p class="highlight-text">
            You will receive a <strong>separate email from DocuSign</strong> with the subject 
            <em>"Please sign your Agent Partnership Agreement"</em> within the next few minutes.
          </p>
          <p class="instruction-text">
            Please check your email inbox (and spam/junk folder if needed) for the DocuSign signing request.
          </p>
        </div>

        <!-- Important Instructions -->
        <div class="instructions-box">
          <h3 class="instructions-title">⚠️ Important Instructions:</h3>
          <ul class="instructions-list">
            <li><strong>Look for an email from DocuSign</strong> (typically from <code>dse&#64;docusign.net</code>)</li>
            <li>Click the <strong>"Review Document"</strong> button in the DocuSign email</li>
            <li>Carefully review the entire document before signing</li>
            <li>Add your signature at all designated signature fields</li>
            <li>Complete all fields marked as required</li>
            <li>Click <strong>"Finish"</strong> to complete the signing process</li>
          </ul>
        </div>

        <!-- What Happens Next -->
        <div class="timeline-box">
          <h3 class="timeline-title">📋 What Happens Next?</h3>
          <ol class="timeline-list">
            <li>
              <span class="timeline-step">Step 1:</span>
              <span class="timeline-text">You'll receive a signing email from DocuSign (within minutes)</span>
            </li>
            <li>
              <span class="timeline-step">Step 2:</span>
              <span class="timeline-text">Sign the agreement through DocuSign's secure platform</span>
            </li>
            <li>
              <span class="timeline-step">Step 3:</span>
              <span class="timeline-text">Once signed, you'll receive a payment setup email from us</span>
            </li>
            <li>
              <span class="timeline-step">Step 4:</span>
              <span class="timeline-text">Complete your payment to activate your account</span>
            </li>
          </ol>
        </div>

        <!-- Note -->
        <div class="note-box">
          <p class="note-text">
            <strong>Note:</strong> After signing, you will automatically receive another email with instructions to complete your payment setup.
          </p>
        </div>

        <!-- Application ID -->
        <div class="app-id" *ngIf="applicationId">
          <p><strong>Application ID:</strong> <code>{{ applicationId }}</code></p>
        </div>

        <!-- Action Button -->
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

        <!-- Help Text -->
        <p class="help-text">
          If you don't receive the DocuSign email within 10 minutes, please check your spam folder or contact your recruiter.
        </p>
      </div>
    </div>
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
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 700px;
      width: 100%;
      padding: 3rem;
      animation: slideUp 0.5s ease-out;
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .success-icon {
      width: 80px;
      height: 80px;
      margin: 0 auto 1.5rem;
      color: #4CAF50;
      animation: scaleIn 0.5s ease-out 0.2s both;
    }

    .success-icon svg {
      width: 100%;
      height: 100%;
    }

    @keyframes scaleIn {
      from {
        transform: scale(0);
      }
      to {
        transform: scale(1);
      }
    }

    .success-title {
      color: #4CAF50;
      font-size: 2rem;
      font-weight: 700;
      margin: 0 0 1rem;
      text-align: center;
    }

    .greeting {
      font-size: 1.125rem;
      color: #333;
      margin: 1rem 0;
      text-align: center;
    }

    .thank-you {
      color: #555;
      font-size: 1rem;
      margin: 1rem 0 2rem;
      text-align: center;
    }

    .next-steps-section {
      background: #f8f9fa;
      border-radius: 12px;
      padding: 1.5rem;
      margin: 2rem 0;
    }

    .section-title {
      color: #333;
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0 0 1rem;
    }

    .highlight-text {
      color: #333;
      font-size: 1rem;
      margin: 0.5rem 0;
      line-height: 1.6;
    }

    .highlight-text strong {
      color: #2196F3;
    }

    .highlight-text em {
      color: #666;
    }

    .instruction-text {
      color: #666;
      font-size: 0.95rem;
      margin: 0.5rem 0;
    }

    .instructions-box {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      border-radius: 8px;
      padding: 1.5rem;
      margin: 2rem 0;
    }

    .instructions-title {
      color: #856404;
      font-size: 1.125rem;
      font-weight: 600;
      margin: 0 0 1rem;
    }

    .instructions-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .instructions-list li {
      color: #856404;
      padding: 0.5rem 0;
      padding-left: 1.5rem;
      position: relative;
      line-height: 1.5;
    }

    .instructions-list li::before {
      content: "✓";
      position: absolute;
      left: 0;
      color: #ffc107;
      font-weight: bold;
    }

    .instructions-list code {
      background: rgba(0, 0, 0, 0.1);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.9em;
    }

    .timeline-box {
      background: #e3f2fd;
      border-left: 4px solid #2196F3;
      border-radius: 8px;
      padding: 1.5rem;
      margin: 2rem 0;
    }

    .timeline-title {
      color: #1565C0;
      font-size: 1.125rem;
      font-weight: 600;
      margin: 0 0 1rem;
    }

    .timeline-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .timeline-list li {
      color: #1565C0;
      padding: 0.75rem 0;
      display: flex;
      gap: 0.75rem;
      line-height: 1.5;
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
      border-left: 4px solid #8bc34a;
      border-radius: 8px;
      padding: 1rem 1.5rem;
      margin: 2rem 0;
    }

    .note-text {
      color: #33691e;
      margin: 0;
      line-height: 1.6;
    }

    .app-id {
      text-align: center;
      margin: 2rem 0;
      padding: 1rem;
      background: #f5f5f5;
      border-radius: 8px;
    }

    .app-id p {
      margin: 0;
      color: #666;
    }

    .app-id code {
      background: #e0e0e0;
      padding: 4px 8px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      color: #333;
    }

    .action-buttons {
      display: flex;
      gap: 1rem;
      margin: 2rem 0;
      flex-wrap: wrap;
    }

    .btn-primary, .btn-secondary {
      flex: 1;
      min-width: 200px;
      padding: 1rem 2rem;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }

    .btn-primary {
      background: #4CAF50;
      color: white;
    }

    .btn-primary:hover {
      background: #45a049;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);
    }

    .btn-secondary {
      background: #f5f5f5;
      color: #333;
      border: 2px solid #ddd;
    }

    .btn-secondary:hover {
      background: #e8e8e8;
      border-color: #ccc;
    }

    .btn-icon {
      width: 20px;
      height: 20px;
    }

    .help-text {
      text-align: center;
      color: #999;
      font-size: 0.875rem;
      margin: 2rem 0 0;
      line-height: 1.5;
    }

    @media (max-width: 768px) {
      .success-container {
        padding: 1rem;
      }

      .success-card {
        padding: 2rem 1.5rem;
      }

      .success-title {
        font-size: 1.5rem;
      }

      .action-buttons {
        flex-direction: column;
      }

      .btn-primary, .btn-secondary {
        width: 100%;
        min-width: unset;
      }
    }
  `]
})
export class ApplicationSuccessComponent implements OnInit {
  applicationId: string | null = null;
  applicantName: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.applicationId = params['applicationId'] || null;
      this.applicantName = params['name'] || null;
    });
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }

  goToHome(): void {
    this.router.navigate(['/']);
  }
}
