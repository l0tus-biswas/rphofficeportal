# E2E Test Report: Document Hub / Request Documents — Issue #11

**Date:** 2026-06-01  
**Tester:** Senior QA Engineer (Automated)  
**Environment:** Local Development (localhost:4200 / localhost:5000)  
**Reference:** Previous Issue #11  

---

## Executive Summary

The Document Hub system had an **architectural UX issue** where the "Request Document" workflow mixed two distinct purposes into a single UI section. This report documents the findings and the fix applied.

### Problem Statement
> "The 'Request Document' feature appears to be in the wrong section. The purpose of Document Hub should primarily be for admins to upload documents, forms, training materials, and resources that agents can access. Document requests should instead be handled under the Onboarding Docs section."

---

## System Architecture (Before Fix)

| Section | Purpose | Request Feature? |
|---------|---------|-----------------|
| **Document Hub** (`/document-hub`) | Admin uploads docs, agents browse/download | YES — Admin creates requests, Agents respond here |
| **Onboarding Docs** (`/onboarding-hub`) | Fixed doc types for agent onboarding | Partial — Shows notification card but redirects to Document Hub |

### Issues Identified

| # | Severity | Issue | Location |
|---|----------|-------|----------|
| 1 | **Medium** | Onboarding Hub page title incorrectly says "Document Hub" | `onboarding-hub.component.html` line 5 |
| 2 | **High** | Agent's request response workflow is in Document Hub instead of Onboarding Docs | `document-hub.component.html` Requests tab (agent view) |
| 3 | **Medium** | Onboarding Docs "Upload" button for requests redirects to Document Hub | `onboarding-hub.component.html` line 56 (original) |
| 4 | **Low** | Agent Document Hub shows request stats (pending/overdue) that are now irrelevant | `document-hub.component.html` stats section |

---

## Test Scenarios Executed

### TS-01: Admin Document Hub — Library Tab
| Step | Expected | Actual | Status |
|------|----------|--------|--------|
| Login as admin | Dashboard loads | ✓ | **PASS** |
| Navigate to /document-hub | Document Hub page loads | ✓ | **PASS** |
| Verify admin buttons visible | "New Folder", "Upload Files", "Request Document" | All 3 present | **PASS** |
| Verify Library tab content | Folders & files visible | 3 folders, 2 files shown | **PASS** |
| Verify stats cards | Show subfolder/file/request counts | 3/2/1/3 shown | **PASS** |

### TS-02: Admin Document Hub — Requests Tab
| Step | Expected | Actual | Status |
|------|----------|--------|--------|
| Click "Requests" tab | Requests section loads | ✓ | **PASS** |
| Verify requests list | Shows all document requests | 4 requests (QA Scenario, SSN Document, test request, Photos) | **PASS** |
| Verify agent response tracking | Shows per-agent status | Status badges visible (pending/submitted/approved) | **PASS** |
| Verify review actions | Approve/reject buttons for submitted responses | Present for admin | **PASS** |

### TS-03: Agent Document Hub — Library Only (After Fix)
| Step | Expected | Actual | Status |
|------|----------|--------|--------|
| Login as agent (Melissa Test) | Dashboard loads | ✓ | **PASS** |
| Navigate to /document-hub | Document Hub loads | Title + subtitle visible | **PASS** |
| Verify NO "Request Document" button | Only admin buttons hidden | No admin buttons shown | **PASS** |
| Verify Library tab only (no Requests tab) | Requests tab hidden for agents | ✓ (after fix) | **PASS** |
| Verify request stats hidden | Only subfolder/file stats shown | ✓ (after fix) | **PASS** |
| Browse folders | See non-admin-only folders | 2 subfolders visible | **PASS** |

### TS-04: Agent Onboarding Docs — Request Response (After Fix)
| Step | Expected | Actual | Status |
|------|----------|--------|--------|
| Navigate to /onboarding-hub | Page loads with "Onboarding Documents" title | ✓ (after fix) | **PASS** |
| Verify pending requests shown | Yellow card with request titles | Shows requests with pending status | **PASS** |
| Click "Upload" on a request | Inline upload form expands | File input + notes + submit button | **PASS** |
| Select file & submit | Response sent to server | `POST /api/document-hub/requests/:id/respond` | **PASS** |
| After submission | Request disappears from list | Reloads and filters out submitted | **PASS** |
| Verify due date display | Overdue requests shown in red | `isOverdue()` check applied | **PASS** |

### TS-05: Onboarding Docs — Fixed Document Types
| Step | Expected | Actual | Status |
|------|----------|--------|--------|
| Verify doc type cards | All 6 types displayed | APA Agreement, E&O Insurance, CMS Certificate, W-9, Direct Deposit, AHIP-Medicare | **PASS** |
| Verify progress bar | Shows approved/submitted/required counts | "0 approved, 0 submitted of 5 required" | **PASS** |
| Verify upload forms | Each card has file input | ✓ | **PASS** |
| Verify Direct Deposit banking fields | DD card has routing/account/type inputs | ✓ | **PASS** |

### TS-06: Cross-Section Navigation
| Step | Expected | Actual | Status |
|------|----------|--------|--------|
| Sidebar shows "Onboarding Docs" | Links to /onboarding-hub | ✓ | **PASS** |
| Sidebar shows "Document Hub" | Links to /document-hub | ✓ | **PASS** |
| Both pages load independently | No cross-dependency errors | ✓ | **PASS** |

---

## Changes Applied (Fix Summary)

### 1. Onboarding Hub Title Fix
**File:** `frontend/src/app/components/onboarding/onboarding-hub/onboarding-hub.component.html`  
**Change:** Title `"Document Hub"` → `"Onboarding Documents"`

### 2. Inline Request Response in Onboarding Docs
**File:** `frontend/src/app/components/onboarding/onboarding-hub/onboarding-hub.component.html`  
**Change:** Replaced redirect link (`<a [routerLink]="['/document-hub']">Upload</a>`) with expandable inline upload form:
- Toggle Upload/Cancel buttons
- File input
- Optional notes field
- Submit button with loading spinner
- Due date display with overdue highlighting

### 3. Request Response TypeScript Logic
**File:** `frontend/src/app/components/onboarding/onboarding-hub/onboarding-hub.component.ts`  
**Changes:**
- Added state properties: `requestUploadOpen`, `requestFiles`, `requestUploadNotes`, `submittingRequest`
- Added methods: `toggleRequestUpload()`, `onRequestFileSelected()`, `submitRequestResponse()`, `isOverdue()`
- Improved `loadPendingRequests()` filter to only show requests where the agent's status is 'pending'

### 4. Document Hub — Agent View Cleanup
**File:** `frontend/src/app/components/document-hub/document-hub.component.html`  
**Changes:**
- Hidden "Requests" tab for non-admin users (`*ngIf="isAdmin"`)
- Hidden request stat cards (Pending/Overdue) for non-admin users
- Updated subtitle to "Upload, organize, and share documents, forms, and resources"

**File:** `frontend/src/app/components/document-hub/document-hub.component.ts`  
**Change:** Default `activeSection` is now always `'library'` (was 'requests' for agents)

---

## Architecture (After Fix)

| Section | Purpose | Request Feature? |
|---------|---------|-----------------|
| **Document Hub** (`/document-hub`) | Admin uploads docs/forms/resources; agents browse & download | Admin-only: Create requests + review responses |
| **Onboarding Docs** (`/onboarding-hub`) | Agent required document submission (fixed types + admin requests) | Agent: Respond to requests inline with file upload |

### Separation of Concerns (Clean):
- **Document Hub** = Document library (storage, sharing, access)
- **Onboarding Docs** = Document collection (gathering required paperwork from agents)

---

## Build Verification

```
ng build --configuration=development
✓ Build successful (Hash: 4a56d37b3df39572)
✓ No errors (1 pre-existing warning in business-cards component — unrelated)
```

---

## Remaining Observations (Non-Blocking)

| # | Priority | Observation |
|---|----------|-------------|
| 1 | Low | WebSocket connection refused errors in browser console (socket.io on port 5000) — likely dev server not running socket.io |
| 2 | Low | Logo image blocked by ORB policy (`logo-1778574614625-340607392.png`) |
| 3 | Low | Business cards component has an unnecessary `?.` warning on `order.total?.toFixed(2)` |
| 4 | Info | Agent notification badge shows "13" — many unread notifications |

---

## Conclusion

All 6 test scenarios **PASS**. The architectural fix correctly separates Document Hub (document library) from Onboarding Docs (document collection). Agents now respond to admin document requests directly within the Onboarding Docs page without being redirected to a different section. The build compiles cleanly with no new warnings or errors.
