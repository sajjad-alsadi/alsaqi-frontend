# Requirements Document

## Introduction

This document specifies the requirements for a comprehensive technical debt remediation effort on the AL-SAQI (نظام الساقي) internal audit management system. The system is built with React 19, Express 5, TypeScript 5.9, and PostgreSQL/PGlite, designed to run air-gapped (no internet dependency) and handle sensitive banking/payment audit data. The remediation addresses critical security vulnerabilities, data integrity issues, developer experience gaps, and accessibility deficiencies across the ~100+ component, 28-route, 32-service codebase.

## Glossary

- **Server**: The Express 5 backend application defined in `server.ts` and the `src/server/` directory
- **Migration_System**: The database schema initialization module at `src/server/db/migrations.ts`
- **Auth_Module**: The authentication and authorization middleware and services (`src/server/middleware/auth.ts`, `src/server/services/AuthService.ts`, `src/server/routes/auth/`)
- **CSRF_Guard**: A middleware component that validates anti-CSRF tokens on state-changing requests
- **Role_Registry**: The centralized role definition system in `src/constants.ts` and `src/types.ts`
- **Key_Store**: The RSA key persistence mechanism for JWT signing keys
- **Linter**: The ESLint static analysis tool and Prettier code formatter
- **Test_Suite**: The Vitest-based test infrastructure and associated test files
- **Context_Layer**: The React Context providers in `src/context/` that supply global state
- **OpenAPI_Spec**: A machine-readable API specification following the OpenAPI 3.1 standard
- **Container_Image**: A Docker image packaging the application for deployment
- **Frontend**: The React 19 single-page application served by Vite

## Requirements

### Requirement 1: Remove Debug Logging from Production Code

**User Story:** As a security engineer, I want all debug instrumentation removed from the server entry point, so that sensitive session data is not leaked to local files or external endpoints.

#### Acceptance Criteria

1. THE Server SHALL NOT contain the `agentDebugLog` function or any references to it
2. THE Server SHALL NOT write to any file matching the pattern `debug-*.log`
3. THE Server SHALL NOT make HTTP requests to `127.0.0.1:7867` or any hardcoded debug ingest endpoint
4. THE Server SHALL NOT contain any `#region agent log` / `#endregion` comment blocks
5. WHEN the Server starts, THE Server SHALL NOT reference hardcoded session identifiers (e.g., `eece07`)
6. THE Server SHALL use only the structured `logger` utility from `src/server/utils/logger.ts` for all logging output

### Requirement 2: Eliminate Destructive DROP TABLE Statements in Migrations

**User Story:** As a system administrator, I want migrations to preserve existing data on server restart, so that application settings and PDF configurations are not destroyed.

#### Acceptance Criteria

1. THE Migration_System SHALL NOT execute `DROP TABLE IF EXISTS app_settings`
2. THE Migration_System SHALL NOT execute `DROP TABLE IF EXISTS pdf_settings`
3. THE Migration_System SHALL NOT execute `DROP TABLE IF EXISTS user_management_settings`
4. THE Migration_System SHALL use `CREATE TABLE IF NOT EXISTS` for all table definitions
5. THE Migration_System SHALL define the `outgoing_letters` table exactly once
6. WHEN the Server restarts, THE Migration_System SHALL preserve all existing data in `app_settings`, `pdf_settings`, and `user_management_settings` tables

### Requirement 3: Add CSRF Protection

**User Story:** As a security engineer, I want state-changing API requests to be protected by CSRF tokens, so that cross-site request forgery attacks are prevented.

#### Acceptance Criteria

1. WHEN a user authenticates successfully, THE Auth_Module SHALL issue a CSRF token to the client via a response header or non-httpOnly cookie
2. WHEN a state-changing request (POST, PUT, PATCH, DELETE) is received, THE CSRF_Guard SHALL validate the presence and correctness of the CSRF token
3. IF a state-changing request lacks a valid CSRF token, THEN THE CSRF_Guard SHALL reject the request with HTTP 403 status and an error message indicating CSRF validation failure
4. THE CSRF_Guard SHALL exempt the `/api/auth/login` endpoint from CSRF validation
5. THE CSRF_Guard SHALL exempt the `/health` endpoint from CSRF validation
6. THE CSRF token SHALL be cryptographically random with a minimum of 32 bytes of entropy
7. WHEN a new access token is issued (login or refresh), THE Auth_Module SHALL generate a new CSRF token

### Requirement 4: Unify Role Naming Convention

**User Story:** As a developer, I want a single canonical role identifier for each role, so that authorization checks are consistent and security gaps from naming mismatches are eliminated.

#### Acceptance Criteria

1. THE Role_Registry SHALL define each role with exactly one canonical string identifier
2. THE Role_Registry SHALL NOT use both `'Admin'` and `'Administrator'` to refer to the same role
3. WHEN a role check is performed anywhere in the codebase, THE Role_Registry SHALL use the canonical identifier from the centralized enum
4. THE `User` type definition SHALL reference the canonical role enum values instead of string literals
5. THE `ADMIN_ROLES`, `COMPLIANCE_ROLES`, and `STAFF_ROLES` arrays SHALL contain only canonical role identifiers without duplicates
6. WHEN the Migration_System runs, THE Migration_System SHALL migrate existing user records with non-canonical role names to the canonical identifier

### Requirement 5: Implement Migration Versioning System

**User Story:** As a system administrator, I want database migrations to track which migrations have already been applied, so that migrations run only once and schema changes are applied incrementally.

#### Acceptance Criteria

1. THE Migration_System SHALL maintain a `schema_migrations` table recording each applied migration's version identifier and timestamp
2. WHEN the Server starts, THE Migration_System SHALL compare applied migrations against available migrations
3. THE Migration_System SHALL execute only migrations that have not been previously applied
4. WHEN a migration completes successfully, THE Migration_System SHALL record its version in the `schema_migrations` table within the same transaction
5. IF a migration fails, THEN THE Migration_System SHALL halt execution, log the error with the failing migration version, and leave the `schema_migrations` table unchanged for that version
6. THE Migration_System SHALL execute pending migrations in sequential version order
7. THE Migration_System SHALL support both schema DDL migrations and data seed migrations

### Requirement 6: Fix RSA Key Persistence

**User Story:** As a system administrator, I want JWT signing keys to persist across container restarts, so that user sessions remain valid after deployment.

#### Acceptance Criteria

1. THE Key_Store SHALL persist RSA keys to a configurable directory specified by an environment variable (e.g., `DATA_DIR` or `PERSISTENT_DATA_DIR`)
2. THE Key_Store SHALL NOT store RSA keys in `/tmp` or any OS-designated temporary directory
3. WHEN the Server starts and persisted keys exist, THE Key_Store SHALL load the existing RSA key pair
4. WHEN the Server starts and no persisted keys exist, THE Key_Store SHALL generate a new RSA key pair and persist it
5. THE Key_Store SHALL encrypt persisted keys at rest using a key derived from `JWT_SECRET`
6. IF the `DATA_DIR` environment variable is not set, THEN THE Key_Store SHALL default to a `./data` directory relative to the application root

### Requirement 7: Add ESLint and Prettier Configuration

**User Story:** As a developer, I want automated linting and formatting tools configured, so that code quality and style consistency are enforced across the codebase.

#### Acceptance Criteria

1. THE Linter SHALL include an ESLint configuration file at the project root supporting TypeScript and React
2. THE Linter SHALL include a Prettier configuration file at the project root
3. THE Linter SHALL define a `lint` script in `package.json` that runs ESLint on all TypeScript and TSX files
4. THE Linter SHALL define a `format` script in `package.json` that runs Prettier on all source files
5. THE Linter SHALL configure rules appropriate for React 19, TypeScript strict mode, and Express backend code
6. THE Linter SHALL not report errors on the existing codebase that would block the build (initial configuration should use warning-level for pre-existing violations)

### Requirement 8: Increase Test Coverage

**User Story:** As a developer, I want meaningful test coverage across critical modules, so that regressions are caught before deployment.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for all authentication flows (login, token refresh, logout, session invalidation)
2. THE Test_Suite SHALL include unit tests for the permission checking middleware (`checkPermission`, `authorize`)
3. THE Test_Suite SHALL include unit tests for the migration versioning system
4. THE Test_Suite SHALL include integration tests for at least 5 critical API routes (auth, audit plans, findings, recommendations, users)
5. THE Test_Suite SHALL include component tests for at least 3 complex React components
6. WHEN the `npm run test` command is executed, THE Test_Suite SHALL produce a coverage report
7. THE Test_Suite SHALL achieve a minimum of 40% line coverage for `src/server/` directory

### Requirement 9: Fix Context Provider Re-renders

**User Story:** As a user, I want the application to render efficiently, so that interactions are responsive and do not cause unnecessary UI updates.

#### Acceptance Criteria

1. THE Context_Layer SHALL split state into domain-specific contexts so that updates to one domain do not trigger re-renders in unrelated consumers
2. THE Context_Layer SHALL memoize context values using `useMemo` to prevent reference-equality re-renders
3. THE Context_Layer SHALL memoize callback functions using `useCallback` to maintain stable references
4. WHEN a preference value (language, theme, layout) changes, THE Context_Layer SHALL NOT trigger re-renders in components that only consume authentication state
5. WHEN authentication state changes, THE Context_Layer SHALL NOT trigger re-renders in components that only consume preference state

### Requirement 10: Add OpenAPI Specification

**User Story:** As a developer, I want a machine-readable API specification, so that API consumers can generate clients and validate requests automatically.

#### Acceptance Criteria

1. THE OpenAPI_Spec SHALL be a valid OpenAPI 3.1 document in YAML format located at `docs/openapi.yaml`
2. THE OpenAPI_Spec SHALL document all API endpoints defined in `src/server/routes/`
3. THE OpenAPI_Spec SHALL include request body schemas, response schemas, and authentication requirements for each endpoint
4. THE OpenAPI_Spec SHALL define reusable schema components for shared data models (User, AuditPlan, Finding, Recommendation, RiskItem)
5. WHEN the Server is running, THE Server SHALL serve the OpenAPI_Spec at the `/api/docs` endpoint

### Requirement 11: Add Dockerfile for Containerization

**User Story:** As a DevOps engineer, I want a production-ready Dockerfile, so that the application can be deployed consistently in containerized environments.

#### Acceptance Criteria

1. THE Container_Image SHALL use a multi-stage build to separate build dependencies from the runtime image
2. THE Container_Image SHALL use a Node.js 20 LTS base image
3. THE Container_Image SHALL include only production dependencies and the compiled application in the final stage
4. THE Container_Image SHALL expose port 3000
5. THE Container_Image SHALL define a `VOLUME` for the persistent data directory (RSA keys, uploads)
6. THE Container_Image SHALL set `NODE_ENV=production` in the runtime stage
7. THE Container_Image SHALL run the application as a non-root user
8. THE Container_Image SHALL NOT include development dependencies, source maps, or test files in the final stage

### Requirement 12: Accessibility Improvements

**User Story:** As a user relying on assistive technology, I want the application to announce dynamic content changes and provide navigation shortcuts, so that the interface is usable without visual interaction.

#### Acceptance Criteria

1. THE Frontend SHALL include a skip-to-content link as the first focusable element on every page
2. THE Frontend SHALL include an `aria-live="polite"` region that announces route changes and page titles
3. WHEN a form submission succeeds or fails, THE Frontend SHALL announce the result via an `aria-live` region
4. WHEN a toast notification appears, THE Frontend SHALL announce its content via an `aria-live="assertive"` region
5. THE Frontend SHALL ensure all interactive elements have accessible names (via `aria-label`, `aria-labelledby`, or visible text)
6. THE Frontend SHALL support keyboard navigation for all modal dialogs (focus trap, Escape to close)
7. WHEN the language direction changes (LTR/RTL), THE Frontend SHALL update the `dir` and `lang` attributes on the `<html>` element
