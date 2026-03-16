// Placeholder components - Implement based on dashboard pattern
import { Component } from '@angular/core';

@Component({
  selector: 'app-profile',
  template: '<app-navbar></app-navbar><div class="container-fluid mt-4"><h2>Profile</h2></div>',
  styles: []
})
export class ProfileComponent { }

@Component({
  selector: 'app-recruits',
  template: '<app-navbar></app-navbar><div class="container-fluid mt-4"><h2>My Recruits</h2></div>',
  styles: []
})
export class RecruitsComponent { }

@Component({
  selector: 'app-downline',
  template: '<app-navbar></app-navbar><div class="container-fluid mt-4"><h2>Downline Tree</h2></div>',
  styles: []
})
export class DownlineComponent { }

@Component({
  selector: 'app-training',
  template: '<app-navbar></app-navbar><div class="container-fluid mt-4"><h2>Training Materials</h2></div>',
  styles: []
})
export class TrainingComponent { }

@Component({
  selector: 'app-forgot-password',
  template: '<div class="container-fluid mt-4"><h2>Forgot Password</h2></div>',
  styles: []
})
export class ForgotPasswordComponent { }

@Component({
  selector: 'app-reset-password',
  template: '<div class="container-fluid mt-4"><h2>Reset Password</h2></div>',
  styles: []
})
export class ResetPasswordComponent { }
