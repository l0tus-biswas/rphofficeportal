import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { PaymentInterceptor } from './interceptors/payment.interceptor';

// Components
import { LoginComponent } from './components/login/login.component';
import { ApplyComponent } from './components/apply/apply.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { ProfileComponent } from './components/profile/profile.component';
import { RecruitsComponent } from './components/recruits/recruits.component';
import { DownlineComponent } from './components/downline/downline.component';
import { TrainingComponent } from './components/training/training.component';
import { NavbarComponent } from './components/shared/navbar/navbar.component';
import { SidebarComponent } from './components/shared/sidebar/sidebar.component';
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
import { BroadcastsComponent } from './components/broadcasts/broadcasts.component';
import { BroadcastManagementComponent } from './components/admin/broadcast-management/broadcast-management.component';
import { BroadcastPopupComponent } from './components/shared/broadcast-popup/broadcast-popup.component';
import { ApplicationSuccessComponent } from './components/apply/application-success.component';
import { AgentCarriersComponent } from './components/carriers/agent-carriers/agent-carriers.component';
import { CarrierAppointmentsComponent } from './components/admin/carrier-appointments/carrier-appointments.component';
import { CommissionsComponent } from './components/commissions/commissions/commissions.component';
import { CommissionStatementsComponent } from './components/admin/commission-statements/commission-statements.component';
import { OnboardingHubComponent } from './components/onboarding/onboarding-hub/onboarding-hub.component';
import { DocumentHubComponent } from './components/document-hub/document-hub.component';
import { NextStepsChecklistComponent } from './components/dashboard/next-steps-checklist/next-steps-checklist.component';
import { OnboardingDocTypesComponent } from './components/admin/onboarding-doc-types/onboarding-doc-types.component';
import { AdminOnboardingListComponent } from './components/admin/onboarding-management/admin-onboarding-list/admin-onboarding-list.component';
import { AdminOnboardingDetailComponent } from './components/admin/onboarding-management/admin-onboarding-detail/admin-onboarding-detail.component';
import { AcaTrackerComponent } from './components/dashboard/aca-tracker/aca-tracker.component';
import { AcaManagementComponent } from './components/admin/aca-management/aca-management.component';
import { BusinessCardsComponent } from './components/business-cards/business-cards.component';
import { VistaprintConfigComponent } from './components/admin/vistaprint-config/vistaprint-config.component';
import { PromotionTrackerComponent } from './components/dashboard/promotion-tracker/promotion-tracker.component';
import { PromotionLevelsComponent } from './components/admin/promotion-levels/promotion-levels.component';
import { MyTeamComponent } from './components/my-team/my-team.component';
import { ExamfxProgressComponent } from './components/examfx-progress/examfx-progress.component';
import { WelcomeMessageComponent } from './components/admin/welcome-message/welcome-message.component';
import { NotFoundComponent } from './components/not-found/not-found.component';

// Pipes
import { SafePipe } from './pipes/safe.pipe';

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    ApplyComponent,
    DashboardComponent,
    ProfileComponent,
    RecruitsComponent,
    DownlineComponent,
    TrainingComponent,
    NavbarComponent,
    SidebarComponent,
    UserManagementComponent,
    HierarchyComponent,
    TrainingManagementComponent,
    CouponManagementComponent,
    ForgotPasswordComponent,
    ResetPasswordComponent,
    OnboardingUploadComponent,
    OnboardingStatusComponent,
    SystemConfigComponent,
    OneTimePaymentComponent,
    SubscriptionPaymentComponent,
    PaymentSuccessComponent,
    ApaPaymentSuccessComponent,
    UserTransactionsComponent,
    AdminPaymentManagementComponent,
    LicensingComponent,
    ProductionComponent,
    CarriersComponent,
    ProductManagementComponent,
    BrandingComponent,
    SignApaComponent,
    ApaPaymentComponent,
    AdminApaListComponent,
    AdminApaDetailComponent,
    TranslationComponent,
    NotificationsComponent,
    BroadcastsComponent,
    BroadcastManagementComponent,
    BroadcastPopupComponent,
    SafePipe,
    AgentCarriersComponent,
    CarrierAppointmentsComponent,
    CommissionsComponent,
    CommissionStatementsComponent,
    OnboardingHubComponent,
    DocumentHubComponent,
    NextStepsChecklistComponent,
    OnboardingDocTypesComponent,
    AdminOnboardingListComponent,
    AdminOnboardingDetailComponent,
    AcaTrackerComponent,
    AcaManagementComponent,
    BusinessCardsComponent,
    VistaprintConfigComponent,
    PromotionTrackerComponent,
    PromotionLevelsComponent,
    MyTeamComponent,
    ExamfxProgressComponent,
    WelcomeMessageComponent,
    NotFoundComponent
  ],
  imports: [
    BrowserModule,
    CommonModule,
    AppRoutingModule,
    HttpClientModule,
    FormsModule,
    DragDropModule,
    ReactiveFormsModule,
    ApplicationSuccessComponent
  ],
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: PaymentInterceptor,
      multi: true
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
