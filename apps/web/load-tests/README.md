# Load tests (k6)

Load-test scripts for the AL-SAQI frontend's core read workflow:
**login → audit-plan list → finding**, executed in that order.

These scripts run with the [k6](https://k6.io) runtime (`k6 run`). They are **not**
part of the Vite/app build and are never bundled — k6 executes them with its own
JavaScript runtime.

## Prerequisites

Install the k6 binary (one-time):

- macOS: `brew install k6`
- Windows: `winget install k6.k6` (or `choco install k6`)
- Linux / CI: see https://grafana.com/docs/k6/latest/set-up/install-k6/

## Running

The backend base URL is an **external parameter** — no source edit is needed to
retarget. Pass it with `-e BASE_URL=...`:

```bash
# Local dev backend (default)
k6 run apps/web/load-tests/workflow.js

# Explicit / remote backend
k6 run -e BASE_URL=https://staging.example.com/api apps/web/load-tests/workflow.js

# Override credentials and load profile
k6 run \
  -e BASE_URL=https://staging.example.com/api \
  -e USERNAME=admin -e PASSWORD=admin123 \
  -e VUS=20 -e DURATION=2m \
  apps/web/load-tests/workflow.js
```

## External parameters

All parameters are supplied via `-e KEY=VALUE` (k6 environment variables):

| Parameter  | Default                      | Description                                       |
| ---------- | ---------------------------- | ------------------------------------------------- |
| `BASE_URL` | `http://localhost:3000/api`  | API base URL, including the `/api` prefix         |
| `USERNAME` | `admin`                      | Login username                                    |
| `PASSWORD` | `admin123`                   | Login password                                    |
| `VUS`      | `5`                          | Number of virtual users                           |
| `DURATION` | `30s`                        | Test duration                                     |

## What it exercises

1. **Login** — `POST /v1/auth/login` (attaches `x-csrf-token` from the
   `csrf-token` cookie when present, mirroring the real API client).
2. **Audit-plan list** — `GET /v1/audit-plans` (envelope-unwrapped list).
3. **Finding** — `GET /v1/findings`, scoped by `audit_id` to the first audit
   plan returned in step 2 so the workflow stays causally ordered.

Per-step latency is recorded as custom trends (`step_login_duration`,
`step_audit_plan_list_duration`, `step_finding_duration`). Thresholds fail the
run if the check pass-rate drops below 99%, the HTTP error rate exceeds 1%, or
p95 latency exceeds 2s.

> Load tests are backend-dependent and run out of the CI critical path
> (scheduled / on-demand), as noted in the design's Performance Considerations.
