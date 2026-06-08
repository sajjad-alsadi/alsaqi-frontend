import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    standard_load: {
      executor: 'constant-vus',
      vus: 50,
      duration: '5m',
    },
    smoke: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
      tags: { type: 'smoke' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    http_reqs: ['rate>100'],
  },
};

export default function () {
  // Login
  const loginRes = http.post(`${__ENV.BASE_URL}/api/auth/login`, JSON.stringify({
    username: __ENV.TEST_USER,
    password: __ENV.TEST_PASS,
  }), { headers: { 'Content-Type': 'application/json' } });

  check(loginRes, { 'login 200': (r) => r.status === 200 });
  const token = loginRes.json('token');

  // List audits
  const headers = { Authorization: `Bearer ${token}` };
  const auditsRes = http.get(`${__ENV.BASE_URL}/api/audit-plans`, { headers });
  check(auditsRes, { 'list audits 200': (r) => r.status === 200 });

  sleep(1);
}
