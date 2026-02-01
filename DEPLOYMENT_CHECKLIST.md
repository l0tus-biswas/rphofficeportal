# DocuSign New Template Integration - Deployment Checklist

## Pre-Deployment Checklist

### 1. Environment Configuration ✓
- [ ] Update `.env` file with new template ID
  ```bash
  DOCUSIGN_TEMPLATE_ID=59914a8d-766e-469e-a29b-e955bf2df4da
  ```
- [ ] Verify all DocuSign credentials are present:
  - [ ] `DOCUSIGN_INTEGRATION_KEY`
  - [ ] `DOCUSIGN_ACCOUNT_ID`
  - [ ] `DOCUSIGN_USER_ID`
  - [ ] `DOCUSIGN_PRIVATE_KEY` or `DOCUSIGN_PRIVATE_KEY_PATH`
  - [ ] `DOCUSIGN_BASE_PATH` (demo or production)

### 2. Testing ✓
- [ ] Run template field extraction script:
  ```bash
  cd backend
  node scripts/fetch-new-template-fields.js
  ```
- [ ] Verify script completes successfully
- [ ] Review `backend/scripts/new-template-fields.json` output
- [ ] Confirm all 75 fields are present (33 text + 42 checkboxes)

### 3. Integration Testing ✓
- [ ] Update test email addresses in `backend/scripts/test-new-template-integration.js`
- [ ] Run integration test script:
  ```bash
  cd backend
  node scripts/test-new-template-integration.js
  ```
- [ ] Verify all 3 test cases pass
- [ ] Check test email inboxes for DocuSign signing requests
- [ ] Open each envelope and verify:
  - [ ] All personal information is pre-filled
  - [ ] Text fields are locked (read-only)
  - [ ] Checkboxes are correctly checked/unchecked
  - [ ] Agreement date is current
  - [ ] No fields are missing or blank

### 4. Manual End-to-End Testing ✓
- [ ] Restart backend server with new `.env`
- [ ] Submit a real test application through UI:
  - [ ] Use a real email address you can access
  - [ ] Fill out all 5 sections of the form
  - [ ] Include at least one "Yes" answer with explanation
  - [ ] Submit the application
- [ ] Verify application saved in database:
  - [ ] Status is `pending_signature`
  - [ ] DocuSign envelope ID is present
- [ ] Check email for DocuSign signing request
- [ ] Open DocuSign envelope and verify:
  - [ ] All fields match submitted application data
  - [ ] No fields are editable (all locked)
  - [ ] Document has 30 pages
  - [ ] Signature placeholder is present
- [ ] Complete signing process
- [ ] Verify webhook updates application:
  - [ ] Status changes to `pending_payment`
  - [ ] `signedAt` timestamp is recorded
- [ ] Test payment flow continues normally

### 5. Code Review ✓
- [ ] Review changes in `backend/utils/docusign.js`
- [ ] Verify `createSignerTabs()` maps all required fields
- [ ] Check that helper functions work correctly
- [ ] Confirm error handling is in place
- [ ] Review console logging for debugging

### 6. Documentation ✓
- [ ] Read [NEW_TEMPLATE_INTEGRATION.md](./NEW_TEMPLATE_INTEGRATION.md)
- [ ] Review [INTEGRATION_SUMMARY.md](./INTEGRATION_SUMMARY.md)
- [ ] Keep this checklist for production deployment

## Deployment Steps

### Development Environment
1. [ ] Commit all changes to version control
2. [ ] Update `.env` file
3. [ ] Restart backend server:
   ```bash
   cd backend
   npm start
   ```
4. [ ] Monitor console logs for any errors
5. [ ] Submit 1-2 test applications
6. [ ] Verify envelopes are created successfully

### Staging Environment (if applicable)
1. [ ] Deploy code changes to staging
2. [ ] Update staging `.env` file
3. [ ] Restart staging backend
4. [ ] Run integration tests on staging
5. [ ] Submit test applications
6. [ ] Verify complete flow end-to-end

### Production Environment
1. [ ] Schedule maintenance window (if needed)
2. [ ] Backup current production database
3. [ ] Deploy code changes to production
4. [ ] Update production `.env` file with new template ID
5. [ ] Restart production backend
6. [ ] Monitor logs for first 10 minutes
7. [ ] Submit a test application (use test email)
8. [ ] Verify envelope creation
9. [ ] Monitor first 5 real applications closely
10. [ ] Check error logs and DocuSign activity

## Post-Deployment Verification

### Immediate Checks (First Hour)
- [ ] No errors in backend logs
- [ ] DocuSign API calls succeeding
- [ ] Envelopes being created successfully
- [ ] Emails being sent by DocuSign
- [ ] Webhook events being received

### Short-term Monitoring (First Day)
- [ ] All applications creating envelopes successfully
- [ ] No field mapping errors
- [ ] All emails delivered
- [ ] Signatures completing normally
- [ ] Payment flow working after signing
- [ ] No user complaints about missing/incorrect data

### Long-term Monitoring (First Week)
- [ ] Track envelope completion rates
- [ ] Monitor for any declined/voided envelopes
- [ ] Check for any pattern in errors
- [ ] Gather user feedback on signing experience
- [ ] Verify signed documents are being archived correctly

## Rollback Plan

### If Issues Arise:
1. [ ] Identify the issue (check logs, DocuSign dashboard)
2. [ ] If critical, prepare to rollback:
   - [ ] Revert `.env` to old template ID
   - [ ] Restart backend server
   - [ ] Test with old template
3. [ ] Document the issue for investigation
4. [ ] Fix the issue in development
5. [ ] Re-test thoroughly
6. [ ] Re-deploy when ready

### Rollback Steps:
```bash
# 1. Update .env file
DOCUSIGN_TEMPLATE_ID=<OLD_TEMPLATE_ID>

# 2. Restart backend
cd backend
npm restart

# 3. Test envelope creation
node scripts/test-new-template-integration.js

# 4. Verify old template works
```

## Success Criteria

### Integration is successful if:
- ✅ All test cases pass
- ✅ Envelopes created without errors
- ✅ All 75 fields correctly mapped
- ✅ Emails sent successfully
- ✅ Documents signed normally
- ✅ Webhooks update application status
- ✅ No errors in logs
- ✅ Users receive pre-filled documents
- ✅ Data integrity maintained

## Contact & Support

### If you encounter issues:

**Template/Field Issues:**
- Run `fetch-new-template-fields.js` to verify template
- Check field labels match exactly
- Review `createSignerTabs()` function

**Authentication Issues:**
- Verify DocuSign credentials
- Check JWT authentication logs
- Ensure user has template access

**Data Mapping Issues:**
- Check application data structure
- Verify model fields exist
- Review console logs for tabs created

**DocuSign API Issues:**
- Check DocuSign service status
- Review API rate limits
- Verify account permissions

## Notes

### Template Changes
If the template is modified in DocuSign:
1. Re-run `fetch-new-template-fields.js`
2. Update field mapping in `createSignerTabs()`
3. Test thoroughly before deploying

### Database
No database migrations needed - existing schema supports all fields.

### Frontend
No frontend changes needed - existing form collects all data.

### Backward Compatibility
Old pending applications with old template IDs will continue to work. Only new applications use the new template.

---

**Date Completed**: _______________

**Deployed By**: _______________

**Notes**: _______________

---

## Quick Reference

### Important Files
- `backend/utils/docusign.js` - Main integration code
- `backend/.env` - Configuration
- `backend/scripts/fetch-new-template-fields.js` - Template verification
- `backend/scripts/test-new-template-integration.js` - Integration tests
- `NEW_TEMPLATE_INTEGRATION.md` - Technical documentation
- `INTEGRATION_SUMMARY.md` - Quick summary

### Key Commands
```bash
# Fetch template fields
node backend/scripts/fetch-new-template-fields.js

# Run integration tests
node backend/scripts/test-new-template-integration.js

# Start backend
cd backend && npm start

# Start frontend
cd frontend && npm start
```

### Template Info
- **ID**: `59914a8d-766e-469e-a29b-e955bf2df4da`
- **Name**: NEW RHP APA AGREEMENT FINAL
- **Role**: `agent`
- **Pages**: 30
- **Fields**: 75 total (33 text + 42 checkboxes)
