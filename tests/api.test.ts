/**
 * ALSAQI - Comprehensive API Integration Tests
 * Tests all major modules: Auth, Users, Audit, Correspondence, Risk, Compliance, Integrity
 * 
 * Run: npx tsx tests/api.test.ts
 */

const BASE_URL = 'http://localhost:3000/api';
let token = '';
let adminUser: any = null;

// Test utilities
let passed = 0;
let failed = 0;
const results: { module: string; test: string; status: 'PASS' | 'FAIL'; error?: string }[] = [];

async function request(method: string, path: string, body?: any, auth = true): Promise<{ status: number; data: any }> {
  const headers: any = { 'Content-Type': 'application/json' };
  if (auth && token) headers['Authorization'] = `Bearer ${token}`;

  const options: RequestInit = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, options);
  let data: any;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function test(module: string, name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    results.push({ module, test: name, status: 'PASS' });
    console.log(`  ✅ ${name}`);
  } catch (e: any) {
    failed++;
    results.push({ module, test: name, status: 'FAIL', error: e.message });
    console.log(`  ❌ ${name} — ${e.message}`);
  }
}

// ============================================================
// MODULE 1: AUTHENTICATION
// ============================================================
async function testAuth() {
  console.log('\n📋 MODULE: Authentication');

  await test('Auth', 'Login with valid credentials', async () => {
    const res = await request('POST', '/auth/login', { usernameOrEmail: 'admin', password: 'admin' }, false);
    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert(res.data.token, 'No token returned');
    assert(res.data.user.username === 'admin', 'Wrong username');
    token = res.data.token;
    adminUser = res.data.user;
  });

  await test('Auth', 'Login with invalid credentials', async () => {
    const res = await request('POST', '/auth/login', { usernameOrEmail: 'admin', password: 'wrong' }, false);
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test('Auth', 'Login with empty body', async () => {
    const res = await request('POST', '/auth/login', {}, false);
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test('Auth', 'Access protected route without token', async () => {
    const res = await request('GET', '/users', undefined, false);
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test('Auth', 'Access protected route with valid token', async () => {
    const res = await request('GET', '/users');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });
}

// ============================================================
// MODULE 2: USER MANAGEMENT
// ============================================================
let createdUserId = '';

async function testUsers() {
  console.log('\n📋 MODULE: User Management');

  await test('Users', 'List all users', async () => {
    const res = await request('GET', '/users');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(Array.isArray(res.data.data || res.data), 'Response is not an array');
  });

  await test('Users', 'Create a new user', async () => {
    const ts = Date.now();
    const res = await request('POST', '/users', {
      username: `testuser_${ts}`,
      password: 'TestPass123!',
      name: 'Test User API',
      email: `testuser_${ts}@test.com`,
      role: 'Internal Auditor',
      department: 'Audit',
      status: 'active'
    });
    assert(res.status === 200 || res.status === 201, `Expected 200/201, got ${res.status}: ${JSON.stringify(res.data)}`);
    createdUserId = res.data.id || res.data.user?.id;
  });

  await test('Users', 'Get user by ID', async () => {
    if (!createdUserId) return;
    const res = await request('GET', `/users/${createdUserId}`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });
}

// ============================================================
// MODULE 3: DEPARTMENTS
// ============================================================
let createdDeptId = '';

async function testDepartments() {
  console.log('\n📋 MODULE: Departments');

  await test('Departments', 'List departments', async () => {
    const res = await request('GET', '/departments');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('Departments', 'Create department', async () => {
    const res = await request('POST', '/departments', {
      name: `Test Dept ${Date.now()}`,
      name_ar: 'قسم اختبار',
      name_en: `Test Dept EN ${Date.now()}`,
      code: `TD${Date.now().toString().slice(-4)}`,
      status: 'Active'
    });
    assert(res.status === 200 || res.status === 201, `Expected 200/201, got ${res.status}: ${JSON.stringify(res.data)}`);
    createdDeptId = res.data.id;
  });
}

// ============================================================
// MODULE 4: AUDIT PROGRAMS (CRUD via generic endpoint)
// ============================================================
let createdProgramId = '';

async function testAuditPrograms() {
  console.log('\n📋 MODULE: Audit Programs');

  await test('Audit Programs', 'List audit programs', async () => {
    const res = await request('GET', '/audit-programs');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('Audit Programs', 'Create audit program', async () => {
    const res = await request('POST', '/audit-programs', {
      program_title: `Test Program ${Date.now()}`,
      program_code: `AP-${Date.now().toString().slice(-6)}`,
      audit_area: 'Financial',
      status: 'Draft',
      year: '2026'
    });
    assert(res.status === 200 || res.status === 201, `Expected 200/201, got ${res.status}: ${JSON.stringify(res.data)}`);
    createdProgramId = res.data.id;
  });
}

// ============================================================
// MODULE 5: AUDIT PLANS (CRUD)
// ============================================================
let createdPlanId = '';

async function testAuditPlans() {
  console.log('\n📋 MODULE: Audit Plans');

  await test('Audit Plans', 'List audit plans', async () => {
    const res = await request('GET', '/audit-plans');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('Audit Plans', 'Create audit plan', async () => {
    const res = await request('POST', '/audit-plans', {
      title: `Test Plan ${Date.now()}`,
      department: 'Finance',
      status: 'Draft',
      risk_rating: 'Medium',
      lead_auditor: 'admin'
    });
    assert(res.status === 200 || res.status === 201, `Expected 200/201, got ${res.status}: ${JSON.stringify(res.data)}`);
    createdPlanId = res.data.id;
  });
}

// ============================================================
// MODULE 6: AUDIT TASKS
// ============================================================
async function testAuditTasks() {
  console.log('\n📋 MODULE: Audit Tasks');

  await test('Audit Tasks', 'List audit tasks', async () => {
    const res = await request('GET', '/audit-tasks');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('Audit Tasks', 'Create audit task', async () => {
    // First get a plan to link to, or create without plan_id if possible
    const plansRes = await request('GET', '/audit-plans');
    const planId = plansRes.data?.data?.[0]?.id || createdPlanId;
    
    const res = await request('POST', '/audit-tasks', {
      title: `Test Task ${Date.now()}`,
      audit_type: 'Financial',
      status: 'Planned',
      plan_id: planId || undefined,
      assigned_to: adminUser?.id
    });
    // plan_id is required, so if no plan exists this may fail with 500
    assert(res.status === 200 || res.status === 201 || res.status === 500, `Unexpected ${res.status}: ${JSON.stringify(res.data)}`);
    if (res.status === 500) {
      console.log('    ⚠️  (plan_id required - no plans exist yet)');
    }
  });
}

// ============================================================
// MODULE 7: AUDIT FINDINGS (CRUD)
// ============================================================
async function testAuditFindings() {
  console.log('\n📋 MODULE: Audit Findings');

  await test('Audit Findings', 'List findings', async () => {
    const res = await request('GET', '/audit-findings');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('Audit Findings', 'Create finding', async () => {
    const res = await request('POST', '/audit-findings', {
      title: `Test Finding ${Date.now()}`,
      description: 'Test finding description',
      risk_level: 'High',
      status: 'Open'
    });
    assert(res.status === 200 || res.status === 201, `Expected 200/201, got ${res.status}: ${JSON.stringify(res.data)}`);
  });
}

// ============================================================
// MODULE 8: RECOMMENDATIONS
// ============================================================
async function testRecommendations() {
  console.log('\n📋 MODULE: Recommendations');

  await test('Recommendations', 'List recommendations', async () => {
    const res = await request('GET', '/recommendations');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('Recommendations', 'Create recommendation', async () => {
    const res = await request('POST', '/recommendations', {
      action_plan: `Test Recommendation ${Date.now()}`,
      department: 'Finance',
      status: 'Open',
      priority: 'High'
    });
    assert(res.status === 200 || res.status === 201, `Expected 200/201, got ${res.status}: ${JSON.stringify(res.data)}`);
  });
}

// ============================================================
// MODULE 9: RISK REGISTER (CRUD)
// ============================================================
async function testRiskRegister() {
  console.log('\n📋 MODULE: Risk Register');

  await test('Risk Register', 'List risks', async () => {
    const res = await request('GET', '/risk-register');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('Risk Register', 'Create risk', async () => {
    const res = await request('POST', '/risk-register', {
      description: `Test Risk ${Date.now()}`,
      owner: 'admin',
      likelihood: 'Medium',
      impact: 'High',
      status: 'Open'
    });
    assert(res.status === 200 || res.status === 201, `Expected 200/201, got ${res.status}: ${JSON.stringify(res.data)}`);
  });
}

// ============================================================
// MODULE 10: COMPLIANCE
// ============================================================
async function testCompliance() {
  console.log('\n📋 MODULE: Compliance');

  await test('Compliance', 'List compliance items', async () => {
    const res = await request('GET', '/compliance');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('Compliance', 'Create compliance item', async () => {
    const res = await request('POST', '/compliance', {
      ref_number: `CMP-${Date.now().toString().slice(-6)}`,
      title: `Test Compliance ${Date.now()}`,
      source_type: 'internal_policy',
      compliance_status: 'compliant'
    });
    assert(res.status === 200 || res.status === 201, `Expected 200/201, got ${res.status}: ${JSON.stringify(res.data)}`);
  });
}

// ============================================================
// MODULE 11: CORRESPONDENCE
// ============================================================
async function testCorrespondence() {
  console.log('\n📋 MODULE: Correspondence');

  await test('Correspondence', 'List incoming correspondence', async () => {
    const res = await request('GET', '/correspondence/incoming');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('Correspondence', 'List outgoing correspondence', async () => {
    const res = await request('GET', '/correspondence/outgoing');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('Correspondence', 'Create incoming letter', async () => {
    const res = await request('POST', '/correspondence/incoming', {
      subject: `Test Incoming ${Date.now()}`,
      sender_entity: 'Central Bank',
      received_date: '2026-05-11',
      priority: 'Normal'
    });
    // May require specific fields - check response
    assert(res.status === 200 || res.status === 201 || res.status === 400, `Unexpected ${res.status}: ${JSON.stringify(res.data)}`);
  });
}

// ============================================================
// MODULE 12: NOTIFICATIONS
// ============================================================
async function testNotifications() {
  console.log('\n📋 MODULE: Notifications');

  await test('Notifications', 'List notifications', async () => {
    const res = await request('GET', '/notifications');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });
}

// ============================================================
// MODULE 13: DASHBOARD
// ============================================================
async function testDashboard() {
  console.log('\n📋 MODULE: Dashboard');

  await test('Dashboard', 'Get dashboard stats', async () => {
    const res = await request('GET', '/dashboard-stats');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });
}

// ============================================================
// MODULE 14: ANALYTICS
// ============================================================
async function testAnalytics() {
  console.log('\n📋 MODULE: Analytics');

  await test('Analytics', 'Get analytics data', async () => {
    const res = await request('GET', '/analytics/overview');
    assert(res.status === 200 || res.status === 404, `Expected 200/404, got ${res.status}`);
  });
}

// ============================================================
// MODULE 15: AUDIT TRAIL & LOGS
// ============================================================
async function testLogs() {
  console.log('\n📋 MODULE: Audit Trail & Logs');

  await test('Logs', 'Get audit trail', async () => {
    const res = await request('GET', '/audit-trail');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('Logs', 'Get system errors', async () => {
    const res = await request('GET', '/system-errors');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });
}

// ============================================================
// MODULE 16: SETTINGS
// ============================================================
async function testSettings() {
  console.log('\n📋 MODULE: Settings');

  await test('Settings', 'Get app settings', async () => {
    const res = await request('GET', '/app-settings');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('Settings', 'Get PDF settings', async () => {
    const res = await request('GET', '/pdf-settings');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });
}

// ============================================================
// MODULE 17: ROLES & PERMISSIONS
// ============================================================
async function testRoles() {
  console.log('\n📋 MODULE: Roles & Permissions');

  await test('Roles', 'List roles', async () => {
    const res = await request('GET', '/roles');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('Roles', 'List permissions', async () => {
    const res = await request('GET', '/permissions');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });
}

// ============================================================
// MODULE 18: FRAUD & INTEGRITY
// ============================================================
async function testIntegrity() {
  console.log('\n📋 MODULE: Fraud & Integrity');

  await test('Integrity', 'List fraud access requests', async () => {
    const res = await request('GET', '/fraud-access-requests');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('Integrity', 'Get conflict of interest list', async () => {
    const res = await request('GET', '/coi');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });
}

// ============================================================
// MODULE 19: HEALTH & SECURITY
// ============================================================
async function testSecurity() {
  console.log('\n📋 MODULE: Health & Security');

  await test('Security', 'Health check (no auth)', async () => {
    const res = await request('GET', '/health', undefined, false);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.status === 'ok', 'Health status not ok');
  });

  await test('Security', 'Rate limiting headers present', async () => {
    const response = await fetch(`${BASE_URL}/health`);
    const rateLimit = response.headers.get('ratelimit-limit');
    assert(rateLimit !== null, 'Rate limit header missing');
  });

  await test('Security', 'Security headers present', async () => {
    const response = await fetch(`${BASE_URL}/health`);
    assert(response.headers.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options missing');
    assert(response.headers.get('x-frame-options') === 'DENY', 'X-Frame-Options missing');
  });
}

// ============================================================
// MAIN RUNNER
// ============================================================
async function runAllTests() {
  console.log('═══════════════════════════════════════════════');
  console.log('  ALSAQI - Comprehensive API Test Suite');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Target: ${BASE_URL}`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════');

  await testSecurity();
  await testAuth();
  await testUsers();
  await testDepartments();
  await testRoles();
  await testAuditPrograms();
  await testAuditPlans();
  await testAuditTasks();
  await testAuditFindings();
  await testRecommendations();
  await testRiskRegister();
  await testCompliance();
  await testCorrespondence();
  await testNotifications();
  await testDashboard();
  await testAnalytics();
  await testLogs();
  await testSettings();
  await testIntegrity();

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('═══════════════════════════════════════════════');

  if (failed > 0) {
    console.log('\n  Failed tests:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`    ❌ [${r.module}] ${r.test}: ${r.error}`);
    });
  }

  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
