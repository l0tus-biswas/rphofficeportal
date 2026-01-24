# APA / Recruiting Flow Fix Plan

_Prepared for Anuj — 2026-01-18_

## Important Notes
- Recruiter agents must be able to register new agents themselves: recruiter field should be editable/unlocked during APA entry, and recruiter agent IDs should be short, human-searchable values.
- Licensing status form needs an "Other" option with a free-text explanation field (e.g., "real estate") so non-standard licenses are captured.
- After DocuSign is completed, the next in-app step must be the $20/mo card capture page (no upfront setup fee). Include a subtle discount code field.
- Remove the yellow DocuSign instruction banner but keep the "What happens next" section for clarity.
- DocuSign launch page should allow editing the recruit's email before sending, to correct mistakes without restarting the APA form.
- Application currently fires two emails after submission (instructions + DocuSign). Only the instructions email should remain; suppress the duplicate system email.
- DocuSign envelope must originate from "RHP Office" (not "Norge Hernandez"). Inside the agreement, all fields should be locked (read-only) except the recruiter email correction mechanism in the APA form.
- DocuSign packet order: first page shows the recruit's submitted APA application data, followed by the APA agreement as a single document for acknowledgement + signature.
- Post-signature behavior: RHP Office portal should immediately reflect DocuSign status = signed, unlock payment setup workflow, and trigger an email prompting payment setup if the recruit is self-service.
- Entire APA agreement (and ideally the whole portal) must support English/Spanish toggle. Provide a simple switch, defaulting based on user preference/locale.
- All payment-related messaging must show $20/mo, reference RHP (not ESCAPE), and remove any "setup fee" verbiage.
- Stripe needs to bill only $20/mo; confirm product/price IDs and customer metadata align with that change.
- Payment UI currently shows $179 and mentions ESCAPE—those assets need updates to $20/mo and RHP branding.
- After payment completion, recruiter should be directed immediately to create the recruit's RHP password, plus an email reminder for self-service completion.
- Newly recruited agents are not appearing in the onboarding tab; ensure onboarding list subscribes to the correct status/collection updates.

## To-Do (Prioritized)
1. **Recruiter & Agent Intake**
   - [x] Unlock editable recruiter field; validate but do not lock.
   - [ ] Shorten recruiter agent IDs (consider numeric or short alphanumeric).
   - [x] Enable recruiter search/autocomplete for manual assignments.
2. **Licensing Status UX**
   - [x] Add "Other" option to licensing status with required free-text input when selected.
3. **DocuSign Launch Page**
   - [x] Remove yellow instruction box; keep "What happens next".
   - [x] Add inline "Edit email" control before sending envelope.
   - [x] Ensure only one instructional email is sent (disable redundant system message).
4. **DocuSign Envelope Content**
   - [x] Set sender/subject to "RHP Office" brand (email subject/blurb updated; sender name requires DocuSign admin portal change).
   - [x] Lock all form fields (pre-filled from APA form, read-only during signing).
   - [x] Confirm only recruiter email adjustments happen in APA form (not inside DocuSign).
   - [ ] Reorder documents so APA answers precede agreement in a single packet (requires DocuSign template modification).
5. **Post-DocuSign Payment Flow**
   - [x] On signature webhook, mark application as signed and redirect to payment setup page.
   - [x] Build payment screen for $20/mo subscription with subtle discount-code input.
   - [x] Ensure Stripe price reflects $20/mo, no setup fee, and update email templates to match (RHP branding, $20/mo only).
   - [x] Remove $179 references and any "pay the setup fee" text across UI/emails.
   - [x] Change consent text from "ESCAPE" to "RHP Office".
6. **Password Setup Experience**
   - [x] After payment success, auto-route to password creation screen (uses reset-password with token).
   - [x] Send backup email link with set-password token.
7. **Onboarding Visibility**
   - [x] Fix onboarding tab query to surface newly recruited agents immediately after payment (Onboarding record created when user is created).
8. **Localization**
   - [x] Site-wide EN/ES toggle exists (Google Translate in navbar user menu under "Translation").
   - [ ] DocuSign agreement EN/ES toggle requires DocuSign template configuration (manual admin task).
9. **Email Notifications**
   - [x] Payment-setup email sent post-DocuSign (updated with $20/mo, RHP branding, no setup fee verbiage).
   - [x] Post-payment welcome email sent with set-password link (from utils/email.js sendWelcomeEmail).

## Suggested Next Steps
- [ ] Confirm product/price changes in Stripe dashboard ($20 monthly) and capture new Price ID for config.
- [ ] Scope UI updates (Angular) for recruiter form, licensing page, payment page, and localization toggle.
- [ ] Update backend flows (DocuSign controller + payment routes) to enforce new sender info, document order, and status transitions.
- [ ] QA end-to-end: APA intake → DocuSign send/edit → signature → payment → password → onboarding list.
- [ ] Document final flow so recruiting team can train agents on revised process.
