import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { AgentService } from '../../services/agent.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {
  currentUser: any;
  profileForm!: FormGroup;
  passwordForm!: FormGroup;
  loading = false;
  profileSuccess = '';
  profileError = '';
  passwordSuccess = '';
  passwordError = '';
  editMode = false;

  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private agentService: AgentService
  ) { }

  ngOnInit(): void {
    // Initialize empty forms first
    this.initForms();
    
    // Get current user from localStorage first for immediate display
    this.currentUser = this.authService.getCurrentUser();
    if (this.currentUser) {
      this.updateFormValues();
    }
    
    // Load fresh data from backend
    this.loadProfile();
  }

  loadProfile(): void {
    this.loading = true;
    this.agentService.getProfile().subscribe({
      next: (response: any) => {
        this.currentUser = response.user;
        console.log('Profile data loaded:', this.currentUser);
        // Update localStorage with fresh data
        localStorage.setItem('user', JSON.stringify(this.currentUser));
        this.updateFormValues();
        this.loading = false;
      },
      error: (error: any) => {
        console.error('Failed to load profile', error);
        this.loading = false;
      }
    });
  }

  initForms(): void {
    this.profileForm = this.formBuilder.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      phone: ['', [Validators.required, Validators.minLength(10)]],
      address: [''],
      city: [''],
      state: [''],
      zipCode: ['']
    });

    this.passwordForm = this.formBuilder.group({
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]]
    }, { validators: this.passwordMatchValidator });

    this.profileForm.disable();
  }

  updateFormValues(): void {
    if (this.currentUser && this.profileForm) {
      console.log('Updating form with values:', {
        name: this.currentUser.name,
        phone: this.currentUser.phone,
        address: this.currentUser.address,
        city: this.currentUser.city,
        state: this.currentUser.state,
        zipCode: this.currentUser.zipCode
      });
      
      this.profileForm.patchValue({
        name: this.currentUser.name || '',
        phone: this.currentUser.phone || '',
        address: this.currentUser.address || '',
        city: this.currentUser.city || '',
        state: this.currentUser.state || '',
        zipCode: this.currentUser.zipCode || ''
      });
    }
  }

  passwordMatchValidator(g: FormGroup) {
    return g.get('newPassword')?.value === g.get('confirmPassword')?.value
      ? null : { mismatch: true };
  }

  toggleEditMode(): void {
    this.editMode = !this.editMode;
    if (this.editMode) {
      this.profileForm.enable();
    } else {
      this.profileForm.disable();
      this.initForms();
    }
  }

  updateProfile(): void {
    if (this.profileForm.invalid) {
      return;
    }

    this.loading = true;
    this.profileError = '';
    this.profileSuccess = '';

    this.agentService.updateProfile(this.profileForm.value).subscribe({
      next: (response: any) => {
        this.profileSuccess = 'Profile updated successfully!';
        this.loading = false;
        this.editMode = false;
        this.profileForm.disable();
        
        // Update current user in auth service
        const updatedUser = { ...this.currentUser, ...this.profileForm.value };
        this.authService.updateCurrentUser(updatedUser);
      },
      error: (error: any) => {
        this.profileError = error.error?.message || 'Failed to update profile';
        this.loading = false;
      }
    });
  }

  changePassword(): void {
    if (this.passwordForm.invalid) {
      console.log('Password form is invalid:', this.passwordForm.errors);
      return;
    }

    this.loading = true;
    this.passwordError = '';
    this.passwordSuccess = '';

    console.log('Sending change password request...');
    this.agentService.changePassword(
      this.passwordForm.value.currentPassword,
      this.passwordForm.value.newPassword
    ).subscribe({
      next: (response: any) => {
        console.log('Password change success:', response);
        this.passwordSuccess = 'Password changed successfully!';
        this.loading = false;
        this.passwordForm.reset();
      },
      error: (error: any) => {
        console.error('Password change error:', error);
        this.passwordError = error.error?.message || 'Failed to change password';
        this.loading = false;
      }
    });
  }

  get pf() { return this.profileForm.controls; }
  get pwf() { return this.passwordForm.controls; }

  copyReferralCode(): void {
    const code = this.currentUser?.referralCode;
    if (code) {
      navigator.clipboard.writeText(code);
      this.profileSuccess = 'Referral code copied to clipboard!';
      setTimeout(() => this.profileSuccess = '', 3000);
    }
  }

  copyReferralLink(): void {
    const link = `http://localhost:4200/apply?ref=${this.currentUser?.referralCode}`;
    navigator.clipboard.writeText(link);
    this.profileSuccess = 'Referral link copied to clipboard!';
    setTimeout(() => this.profileSuccess = '', 3000);
  }
}
