/**
 * E2E Test: ExamFX CSV Upload Feature
 * 
 * Tests the complete flow:
 * 1. Admin uploads a CSV file from ExamFX Exam Manager
 * 2. System parses and matches agents by email
 * 3. ExamFXProgress records are created/updated
 * 4. Results report shows matched/unmatched agents
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

// ─── HTTP helpers ───
function request(method, urlPath, body, token, formData) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath.startsWith('http') ? urlPath : BASE_URL + urlPath);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {}
    };

    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    let payload;
    if (formData) {
      const boundary = '----FormBoundary' + Date.now().toString(36);
      options.headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
      const parts = [];
      for (const [key, val] of Object.entries(formData)) {
        if (val.filename) {
          parts.push(
            `--${boundary}\r\nContent-Disposition: form-data; name="${key}"; filename="${val.filename}"\r\nContent-Type: ${val.contentType || 'text/csv'}\r\n\r\n`
          );
          parts.push(val.data);
          parts.push('\r\n');
        } else {
          parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`);
        }
      }
      parts.push(`--${boundary}--\r\n`);
      payload = Buffer.concat(parts.map(p => Buffer.isBuffer(p) ? p : Buffer.from(p)));
      options.headers['Content-Length'] = payload.length;
    } else if (body) {
      payload = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Test CSV content (matches sample format from ExamFX Exam Manager) ───
const TEST_CSV = `Candidate,Email,Phone Number,Course,Manager,Manager Email,Status,Registration,Score Trend,Chapter Progress,Total Hours,Active Alerts,Course Expiration Date,Chapter Quiz Count,Chapter Quizzes Passed,% of Quizzes Passed,Overall Chapter Quiz Average,Best Practice Exam: Exam Mode,Average Practice Exam: Exam Mode,Latest Practice Exam: Exam Mode,Attempt Count Practice Exam: Exam Mode,Best Practice Exam: Learning Mode,Average Practice Exam: Learning Mode,Latest Practice Exam: Learning Mode,Attempt Count Practice Exam: Learning Mode,Best Readiness Exam,Average Readiness Exam,Latest Readiness Exam,Attempt Count Readiness Exam,Certificate Status,Best Certificate Exam,Average Certificate Exam,Latest Certificate Exam,Attempt Count Certificate Exam,First Activity Date,Licensing Exam Date,Last Activity Date
"Test Agent, CSV","csvtest_e2e@rhpoffice.com",555-123-4567,Florida Life and Health,"Hernandez, Norge",rhpenroll@gmail.com,Active,04-01-2026,65.5%,72%,15 hrs 30 mins,1,06-01-2026,12,9,75%,68.2%,72.0%,65.0%,72.0%,3,80.0%,70.0%,80.0%,4,75.0%,70.0%,75.0%,2,Valid,85.0%,85.0%,85.0%,1,04-01-2026,,05-12-2026
"Unmatched Agent, No","nomatch_999@example.com",555-000-0000,Florida Health,"Manager, Test",test@test.com,Active,05-01-2026,30.0%,25%,3 hrs 10 mins,2,07-01-2026,7,2,28%,30.0%,,,,,,,,,,,,,,,,,05-01-2026,,05-10-2026`;

// ─── Main test ───
async function runTest() {
  const results = { passed: 0, failed: 0, errors: [] };

  function assert(condition, message) {
    if (condition) {
      results.passed++;
      console.log(`  ✓ ${message}`);
    } else {
      results.failed++;
      results.errors.push(message);
      console.log(`  ✗ ${message}`);
    }
  }

  try {
    console.log('\n═══════════════════════════════════════════');
    console.log('  ExamFX CSV Upload — E2E Test');
    console.log('═══════════════════════════════════════════\n');

    // Step 1: Login as admin
    console.log('Step 1: Admin login');
    const loginRes = await request('POST', '/api/auth/login', {
      email: 'contracting@rhpoffice.com',
      password: 'admin123'
    });
    assert(loginRes.status === 200, 'Admin login successful');
    const token = loginRes.data.token;
    assert(!!token, 'Got auth token');

    // Step 2: Create a test agent to match against
    console.log('\nStep 2: Create test agent for CSV matching');
    const createRes = await request('POST', '/api/admin/users', {
      name: 'CSV Test Agent',
      email: 'csvtest_e2e@rhpoffice.com',
      phone: '555-123-4567',
      role: 'agent',
      password: 'TestPass123!'
    }, token);
    
    let testAgentId;
    if (createRes.status === 201 || createRes.status === 200) {
      testAgentId = createRes.data.user?._id || createRes.data._id;
      assert(!!testAgentId, `Test agent created: ${testAgentId}`);
    } else if (createRes.status === 400 && createRes.data.message?.includes('exists')) {
      // Agent already exists, find them
      const usersRes = await request('GET', '/api/admin/users?search=csvtest_e2e@rhpoffice.com', null, token);
      testAgentId = usersRes.data.users?.[0]?._id;
      assert(!!testAgentId, `Test agent already exists: ${testAgentId}`);
    } else {
      assert(false, `Failed to create test agent: ${JSON.stringify(createRes.data)}`);
    }

    // Step 3: Upload CSV
    console.log('\nStep 3: Upload ExamFX CSV');
    const csvBuffer = Buffer.from(TEST_CSV, 'utf-8');
    const uploadRes = await request('POST', '/api/examfx/upload-csv', null, token, {
      file: {
        filename: 'ExamFX-Report.csv',
        contentType: 'text/csv',
        data: csvBuffer
      }
    });

    assert(uploadRes.status === 200, `Upload response status: ${uploadRes.status}`);
    assert(uploadRes.data.totalRows === 2, `Total rows parsed: ${uploadRes.data.totalRows}`);
    assert(uploadRes.data.matched >= 1, `Matched agents: ${uploadRes.data.matched}`);
    assert(uploadRes.data.unmatched?.length >= 1, `Unmatched rows: ${uploadRes.data.unmatched?.length}`);
    
    // Check matched details
    const matchedAgent = uploadRes.data.matchedDetails?.find(m => m.agentEmail === 'csvtest_e2e@rhpoffice.com');
    assert(!!matchedAgent, 'Test agent found in matched results');
    if (matchedAgent) {
      assert(matchedAgent.course === 'Florida Life and Health', `Course mapped: ${matchedAgent.course}`);
      assert(matchedAgent.progress === 72, `Progress mapped: ${matchedAgent.progress}%`);
      assert(matchedAgent.certificateStatus === 'Valid', `Certificate status: ${matchedAgent.certificateStatus}`);
    }

    // Check unmatched
    const unmatchedRow = uploadRes.data.unmatched?.find(u => u.email === 'nomatch_999@example.com');
    assert(!!unmatchedRow, 'Unmatched agent correctly identified');

    // Step 4: Verify ExamFXProgress record was created/updated
    console.log('\nStep 4: Verify ExamFX progress record');
    if (testAgentId) {
      const progressRes = await request('GET', `/api/examfx/${testAgentId}`, null, token);
      assert(progressRes.status === 200, 'Progress record exists');
      
      const record = progressRes.data;
      assert(record.enrollmentStatus === 'active', `Enrollment status: ${record.enrollmentStatus}`);
      assert(record.overallPercentComplete === 72, `Overall progress: ${record.overallPercentComplete}%`);
      assert(record.examfxEmail === 'csvtest_e2e@rhpoffice.com', `ExamFX email set: ${record.examfxEmail}`);
      assert(record.lastCsvImportDate != null, `CSV import date set: ${record.lastCsvImportDate}`);
      assert(record.lastSyncStatus === 'success', `Sync status: ${record.lastSyncStatus}`);

      // Verify course data
      assert(record.courses.length >= 1, `Courses count: ${record.courses.length}`);
      const course = record.courses.find(c => c.courseName === 'Florida Life and Health');
      assert(!!course, 'Course "Florida Life and Health" found');
      if (course) {
        assert(course.percentComplete === 72, `Course progress: ${course.percentComplete}%`);
        assert(course.timeSpentMinutes === 930, `Time spent: ${course.timeSpentMinutes} mins (15h30m)`);
        assert(course.passed === true, `Course passed (certificate valid): ${course.passed}`);
        assert(course.scoreTrend === 65.5, `Score trend: ${course.scoreTrend}%`);
        
        // Quiz stats
        assert(course.quizStats?.chapterQuizCount === 12, `Quiz count: ${course.quizStats?.chapterQuizCount}`);
        assert(course.quizStats?.chapterQuizzesPassed === 9, `Quizzes passed: ${course.quizStats?.chapterQuizzesPassed}`);
        assert(course.quizStats?.quizPassRate === 75, `Quiz pass rate: ${course.quizStats?.quizPassRate}%`);

        // Practice exam scores
        assert(course.practiceExamScores?.examMode?.best === 72, `Practice exam mode best: ${course.practiceExamScores?.examMode?.best}%`);
        assert(course.practiceExamScores?.examMode?.attempts === 3, `Practice exam mode attempts: ${course.practiceExamScores?.examMode?.attempts}`);
        assert(course.practiceExamScores?.learningMode?.best === 80, `Practice learn mode best: ${course.practiceExamScores?.learningMode?.best}%`);

        // Readiness exam
        assert(course.readinessExamScores?.best === 75, `Readiness best: ${course.readinessExamScores?.best}%`);
        assert(course.readinessExamScores?.attempts === 2, `Readiness attempts: ${course.readinessExamScores?.attempts}`);

        // Certificate exam
        assert(course.certificateExam?.status === 'Valid', `Certificate status: ${course.certificateExam?.status}`);
        assert(course.certificateExam?.best === 85, `Certificate best: ${course.certificateExam?.best}%`);

        // Dates
        assert(course.startedDate != null, `Start date set`);
        assert(course.lastAccessedDate != null, `Last activity date set`);
        assert(course.courseExpirationDate != null, `Expiration date set`);
      }
    }

    // Step 5: Verify it appears in the summary
    console.log('\nStep 5: Verify summary endpoint includes CSV data');
    const summaryRes = await request('GET', '/api/examfx/summary', null, token);
    assert(summaryRes.status === 200, 'Summary endpoint works');
    const csvAgent = summaryRes.data.agents?.find(a => a.agentEmail === 'csvtest_e2e@rhpoffice.com');
    assert(!!csvAgent, 'CSV-imported agent appears in summary');

    // Step 6: Test re-upload (should update, not duplicate)
    console.log('\nStep 6: Re-upload CSV (update, not duplicate)');
    const reuploadRes = await request('POST', '/api/examfx/upload-csv', null, token, {
      file: {
        filename: 'ExamFX-Report-v2.csv',
        contentType: 'text/csv',
        data: csvBuffer
      }
    });
    assert(reuploadRes.status === 200, 'Re-upload succeeded');
    assert(reuploadRes.data.updated >= 1, `Updated existing records: ${reuploadRes.data.updated}`);

    // Verify no duplicate courses
    if (testAgentId) {
      const progressRes2 = await request('GET', `/api/examfx/${testAgentId}`, null, token);
      const flCourses = progressRes2.data.courses?.filter(c => c.courseName === 'Florida Life and Health');
      assert(flCourses?.length === 1, `No duplicate courses after re-upload: ${flCourses?.length} found`);
    }

    // Step 7: Test error cases
    console.log('\nStep 7: Error cases');
    
    // No file
    const noFileRes = await request('POST', '/api/examfx/upload-csv', null, token);
    assert(noFileRes.status === 400, `No file returns 400: ${noFileRes.status}`);

    // Empty CSV
    const emptyCsvRes = await request('POST', '/api/examfx/upload-csv', null, token, {
      file: {
        filename: 'empty.csv',
        contentType: 'text/csv',
        data: Buffer.from('Candidate,Email,Course\n', 'utf-8')
      }
    });
    assert(emptyCsvRes.status === 400 || (emptyCsvRes.status === 200 && emptyCsvRes.data.totalRows === 0),
      `Empty CSV handled: status ${emptyCsvRes.status}`);

    // Non-admin cannot upload
    console.log('\nStep 8: Non-admin access denied');
    // Create a regular agent token
    const agentLoginRes = await request('POST', '/api/auth/login', {
      email: 'csvtest_e2e@rhpoffice.com',
      password: 'TestPass123!'
    });
    if (agentLoginRes.status === 200 && agentLoginRes.data.token) {
      const agentToken = agentLoginRes.data.token;
      const agentUploadRes = await request('POST', '/api/examfx/upload-csv', null, agentToken, {
        file: {
          filename: 'test.csv',
          contentType: 'text/csv',
          data: csvBuffer
        }
      });
      assert(agentUploadRes.status === 403, `Non-admin rejected: ${agentUploadRes.status}`);
    } else {
      console.log('  ⚠ Skipped non-admin test (agent login failed)');
    }

    // ─── Cleanup ───
    console.log('\nCleanup: Remove test data');
    if (testAgentId) {
      await request('DELETE', `/api/examfx/${testAgentId}`, null, token);
      await request('DELETE', `/api/admin/users/${testAgentId}`, null, token);
      await request('DELETE', `/api/admin/users/${testAgentId}/permanent`, null, token);
      console.log('  ✓ Test agent and ExamFX record cleaned up');
    }

    // ─── Summary ───
    console.log('\n═══════════════════════════════════════════');
    console.log(`  RESULTS: ${results.passed} passed, ${results.failed} failed`);
    console.log('═══════════════════════════════════════════\n');

    if (results.failed > 0) {
      console.log('  Failed assertions:');
      results.errors.forEach(e => console.log(`    ✗ ${e}`));
      process.exit(1);
    }
  } catch (error) {
    console.error('\n  ✗ FATAL ERROR:', error.message);
    process.exit(1);
  }
}

runTest();
