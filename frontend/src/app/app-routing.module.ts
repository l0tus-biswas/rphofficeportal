import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';
import { LoginComponent } from './components/login/login.component';
import { ApplyComponent } from './components/apply/apply.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { ProfileComponent } from './components/profile/profile.component';
import { RecruitsComponent } from './components/recruits/recruits.component';
import { DownlineComponent } from './components/downline/downline.component';
import { TrainingComponent } from './components/training/training.component';
import { UserManagementComponent } from './components/admin/user-management/user-management.component';
import { HierarchyComponent } from './components/admin/hierarchy/hierarchy.component';
import { TrainingManagementComponent } from './components/admin/training-management/training-management.component';
import { CouponManagementComponent } from './components/admin/coupon-management/coupon-management.component';
import { ForgotPasswordComponent } from './components/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './components/reset-password/reset-password.component';
import { OnboardingUploadComponent } from './components/onboarding/onboarding-upload/onboarding-upload.component';
import { OnboardingStatusComponent } from './components/onboarding/onboarding-status/onboarding-status.component';
import { SystemConfigComponent } from './components/admin/system-config/system-config.component';
import { OneTimePaymentComponent } from './components/payment/one-time-payment/one-time-payment.component';
import { SubscriptionPaymentComponent } from './components/payment/subscription-payment/subscription-payment.component';
import { PaymentSuccessComponent } from './components/payment/payment-success/payment-success.component';
import { PaymentSuccessComponent as ApaPaymentSuccessComponent } from './components/payment/payment-success.component';
import { UserTransactionsComponent } from './components/user/user-transactions/user-transactions.component';
import { AdminPaymentManagementComponent } from './components/admin/admin-payment-management/admin-payment-management.component';
import { LicensingComponent } from './components/licensing/licensing.component';
import { ProductionComponent } from './components/production/production.component';
import { CarriersComponent } from './components/admin/carriers/carriers.component';
import { ProductManagementComponent } from './components/admin/product-management/product-management.component';
import { BrandingComponent } from './components/admin/branding/branding.component';
import { SignApaComponent } from './components/sign-apa/sign-apa.component';
import { ApaPaymentComponent } from './components/payment/apa-payment.component';
import { AdminApaListComponent } from './components/admin/admin-apa-list/admin-apa-list.component';
import { AdminApaDetailComponent } from './components/admin/admin-apa-detail/admin-apa-detail.component';
import { TranslationComponent } from './components/user/translation.component';
import { NotificationsComponent } from './components/user/notifications.component';
import { ApplicationSuccessComponent } from './components/apply/application-success.component';
import { AgentCarriersComponent } from './components/carriers/agent-carriers/agent-carriers.component';
import { CarrierAppointmentsComponent } from './components/admin/carrier-appointments/carrier-appointments.component';
import { CommissionsComponent } from './components/commissions/commissions/commissions.component';
import { CommissionStatementsComponent } from './components/admin/commission-statements/commission-statements.component';
import { OnboardingHubComponent } from './components/onboarding/onboarding-hub/onboarding-hub.component';
import { OnboardingDocTypesComponent } from './components/admin/onboarding-doc-types/onboarding-doc-types.component';
import { AcaManagementComponent } from './components/admin/aca-management/aca-management.component';
import { BusinessCardsComponent } from './components/business-cards/business-cards.component';
import { VistaprintConfigComponent } from './components/admin/vistaprint-config/vistaprint-config.component';
import { PromotionLevelsComponent } from './components/admin/promotion-levels/promotion-levels.component';

const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'apply', component: ApplyComponent },
  { path: 'application-success', component: ApplicationSuccessComponent },
  { path: 'payment-success', component: ApaPaymentSuccessComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'reset-password', component: ResetPasswordComponent },
  { 
    path: 'dashboard', 
    component: DashboardComponent, 
    canActivate: [AuthGuard] 
  },
  { 
    path: 'profile', 
    component: ProfileComponent, 
    canActivate: [AuthGuard] 
  },
  { 
    path: 'translation', 
    component: TranslationComponent, 
    canActivate: [AuthGuard] 
  },
  { 
    path: 'notifications', 
    component: NotificationsComponent, 
    canActivate: [AuthGuard] 
  },
  { 
    path: 'recruits', 
    component: RecruitsComponent, 
    canActivate: [AuthGuard],
    data: { roles: ['agent', 'admin'] }
  },
  { 
    path: 'downline', 
    component: DownlineComponent, 
    canActivate: [AuthGuard],
    data: { roles: ['agent', 'admin'] }
  },
  { 
    path: 'training', 
    component: TrainingComponent, 
    canActivate: [AuthGuard] 
  },
  { 
    path: 'licensing', 
    component: LicensingComponent, 
    canActivate: [AuthGuard]
  },
  { 
    path: 'production', 
    component: ProductionComponent, 
    canActivate: [AuthGuard]
  },
  { 
    path: 'onboarding-upload', 
    component: OnboardingUploadComponent, 
    canActivate: [AuthGuard],
    data: { roles: ['agent', 'admin'] }
  },
  { 
    path: 'onboarding', 
    component: OnboardingStatusComponent, 
    canActivate: [AuthGuard],
    data: { roles: ['agent', 'admin'] }
  },
  { 
    path: 'admin/users', 
    component: UserManagementComponent, 
    canActivate: [AuthGuard],
    data: { roles: ['admin'] }
  },
  { 
    path: 'admin/hierarchy', 
    component: HierarchyComponent, 
    canActivate: [AuthGuard],
    data: { roles: ['admin'] }
  },
  { 
    path: 'admin/training', 
    component: TrainingManagementComponent, 
    canActivate: [AuthGuard],
    data: { roles: ['admin'] }
  },
  { 
    path: 'admin/coupons', 
    component: CouponManagementComponent, 
    canActivate: [AuthGuard],
    data: { roles: ['admin'] }
  },
  { 
    path: 'admin/config', 
    component: SystemConfigComponent, 
    canActivate: [AuthGuard],
    data: { roles: ['admin'] }
  },
  { 
    path: 'admin/carriers', 
    component: CarriersComponent, 
    canActivate: [AuthGuard],
    data: { roles: ['admin'] }
  },
  { 
    path: 'admin/products', 
    component: ProductManagementComponent, 
    canActivate: [AuthGuard],
    data: { roles: ['admin'] }
  },
  { 
    path: 'admin/branding', 
    component: BrandingComponent, 
    canActivate: [AuthGuard],
    data: { roles: ['admin'] }
  },
  { 
    path: 'admin/payments', 
    component: AdminPaymentManagementComponent, 
    canActivate: [AuthGuard],
    data: { roles: ['admin'] }
  },
  { 
    path: 'one-time-payment', 
    component: OneTimePaymentComponent
    // No auth guard - accessible during registration
  },
  { 
    path: 'subscription-payment', 
    component: SubscriptionPaymentComponent, 
    canActivate: [AuthGuard]
  },
  { 
    path: 'payment-success', 
    component: PaymentSuccessComponent, 
    canActivate: [AuthGuard]
  },
  { 
    path: 'transactions', 
    component: UserTransactionsComponent, 
    canActivate: [AuthGuard]
  },
  { 
    path: 'sign-apa', 
    component: SignApaComponent
    // No auth - public signature page
  },
  { 
    path: 'apa-payment', 
    component: ApaPaymentComponent
    // No auth - public payment page
  },
  { 
    path: 'admin/apa-applications', 
    component: AdminApaListComponent, 
    canActivate: [AuthGuard],
    data: { roles: ['admin'] }
  },
  { 
    path: 'admin/apa-applications/:id', 
    component: AdminApaDetailComponent, 
    canActivate: [AuthGuard],
    data: { roles: ['admin'] }
  },
  // TIER 3 — Agent routes
  {
    path: 'carriers',
    component: AgentCarriersComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'commissions',
    component: CommissionsComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'onboarding-hub',
    component: OnboardingHubComponent,
    canActivate: [AuthGuard]
  },
  // TIER 3 — Admin routes
  {
    path: 'admin/carrier-appointments',
    component: CarrierAppointmentsComponent,
    canActivate: [AuthGuard],
    data: { roles: ['admin'] }
  },
  {
    path: 'admin/commission-statements',
    component: CommissionStatementsComponent,
    canActivate: [AuthGuard],
    data: { roles: ['admin'] }
  },
  {
    path: 'admin/onboarding-doc-types',
    component: OnboardingDocTypesComponent,
    canActivate: [AuthGuard],
    data: { roles: ['admin'] }
  },
  // TIER 4 — ACA Client Volume
  {
    path: 'admin/aca-management',
    component: AcaManagementComponent,
    canActivate: [AuthGuard],
    data: { roles: ['admin'] }
  },
  // TASK 025 — Vistaprint Business Cards
  {
    path: 'business-cards',
    component: BusinessCardsComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'admin/vistaprint-config',
    component: VistaprintConfigComponent,
    canActivate: [AuthGuard],
    data: { roles: ['admin'] }
  },
  // TASK 022 — Promotion Levels Admin Config
  {
    path: 'admin/promotion-levels',
    component: PromotionLevelsComponent,
    canActivate: [AuthGuard],
    data: { roles: ['admin'] }
  },
  { path: '**', redirectTo: '/dashboard' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
