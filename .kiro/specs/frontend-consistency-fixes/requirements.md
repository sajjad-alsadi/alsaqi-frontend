# Requirements Document

## Introduction

This feature captures a set of frontend consistency and architectural fixes for the `alsaqi-frontend` repository, identified during a frontend ↔ backend consistency review (handoff dated 2026-06-12). All paths are relative to the repository root.

The review confirmed that every API endpoint called by the frontend exists on the server (no 404 calls). The remaining issues are about internal consistency and architecture:

- The shared package `packages/shared` is manually duplicated across the frontend and backend repositories and has drifted only in `types/models.ts`, where the frontend copy is the newest superset (8 extra correct types).
- The `apps/web/src/api` layer has internal inconsistencies: a non-standard type-import source, locally defined Zod validation schemas that can silently drift from the server contract, and TypeScript error suppressions (`@ts-expect-error`) used to bypass an `exactOptionalPropertyTypes` conflict.
- The API base URL and version configuration is sound but should be confirmed across environments.

These fixes are grouped into five requirements (FIX-FE-1 through FIX-FE-5). Two of them (FIX-FE-1 and FIX-FE-3) require coordination with the backend team and depend on an agreed single-shared-source decision, so this document scopes them accordingly. The suggested implementation order is: (1) FIX-FE-2 and FIX-FE-4 as low-risk local cleanup, (2) FIX-FE-5 as environment-config confirmation, then (3) FIX-FE-3 and FIX-FE-1 as architectural changes coordinated with the backend.

## Glossary

- **Frontend_Repo**: The `alsaqi-frontend` repository, rooted at the workspace root, containing `apps/web` and `packages/shared`.
- **Shared_Package**: The package located at `packages/shared`, published/consumed under the import alias `@alsaqi/shared`, containing shared TypeScript types and validators.
- **Backend_Team**: The team responsible for the server repository that maintains its own copy of the shared package.
- **API_Module**: A TypeScript module under `apps/web/src/api/modules/` that provides a typed API client for a backend resource.
- **Shared_Type**: A TypeScript data-model type that represents a backend resource and is intended to be defined once in the Shared_Package (`packages/shared/src/types/models.ts`).
- **Local_Type**: A data-model type defined inside `apps/web/src/types` (e.g. `apps/web/src/types.ts`) that duplicates or stands in for a Shared_Type.
- **Zod_Schema**: A runtime validation schema defined with the `zod` library, used by an API_Module to validate server responses.
- **Shared_Validator**: A Zod_Schema located in `packages/shared/src/validators/` that is intended to be the single source of validation truth for both repositories.
- **Endpoint_Contract**: A type definition under `packages/shared/src/types/endpoints/` that documents the request/response shape of a backend endpoint.
- **Unified_Source**: The single agreed source of the Shared_Package (one of: a published npm package, a git submodule, or a monorepo workspace), to be decided jointly by the Frontend_Repo and Backend_Team.
- **Extra_Shared_Types**: The 8 frontend-only types in `packages/shared/src/types/models.ts` that are not yet present in the server copy: `DashboardStats`, `AuditProgressByType`, `RiskLevelBreakdown`, `Role`, `Permission`, `UserSession`, `JobTitle`, `UserManagementSettings`.
- **HTTP_Client**: The Axios-based client configured in `apps/web/src/api/httpClient.ts` and `apps/web/src/api/client.ts`.
- **API_Version_Constant**: The `API_VERSION` constant exported by the Shared_Package and compared against the server's `X-API-Version` response header.
- **Response_Envelope**: The `{ success, data, meta }` wrapper returned by the server and unwrapped by the HTTP_Client.

## Requirements

### Requirement 1: Unify the shared package (FIX-FE-1)

**User Story:** As a frontend developer, I want a single agreed source for the Shared_Package, so that types do not drift between the frontend and backend repositories.

#### Acceptance Criteria

1. THE Frontend_Repo SHALL retain in `packages/shared/src/types/models.ts` all 8 Extra_Shared_Types (`DashboardStats`, `AuditProgressByType`, `RiskLevelBreakdown`, `Role`, `Permission`, `UserSession`, `JobTitle`, `UserManagementSettings`), each with its complete field set unchanged (no field deleted, renamed, narrowed, or made optional/required differently), verified by a type-level equality check against a recorded baseline of these types.
2. WHILE no Unified_Source decision has been agreed with the Backend_Team, THE Frontend_Repo SHALL make zero local edits to any file under `packages/shared`, verified by a version-control diff producing no changed lines under that path.
3. WHEN a Unified_Source decision is agreed with the Backend_Team, THE Frontend_Repo SHALL switch every `@alsaqi/shared` import to resolve from the Unified_Source such that zero `@alsaqi/shared` imports resolve from the duplicated local copy.
4. IF the import switch leaves one or more `@alsaqi/shared` imports unresolved or failing to build, THEN THE Frontend_Repo SHALL block removal of the duplicated local copy, retain the local files unchanged, and surface a build error identifying the unresolved imports.
5. WHEN every `@alsaqi/shared` import resolves from the Unified_Source, the type-level equality check from criterion 1 passes, and the project's TypeScript build reports zero type errors and zero imports resolving from the local copy, THE Frontend_Repo SHALL remove the duplicated local copy of `packages/shared`.
6. IF a code change would delete, rename, narrow, change the optionality of, or change the field type of any of the 8 Extra_Shared_Types, THEN THE Frontend_Repo SHALL reject that change during review and block the change from merging with a recorded rejection.

### Requirement 2: Standardize the type-import source across API modules (FIX-FE-2)

**User Story:** As a frontend developer, I want all shared data-model types imported from `@alsaqi/shared`, so that there is one consistent import source and no duplicate local definitions.

#### Acceptance Criteria

1. THE API_Module `apps/web/src/api/modules/regulatory.ts` SHALL import `CentralBankInstruction` from the `@alsaqi/shared` package specifier, and SHALL contain no local definition of and no relative-path import (any import path beginning with `./` or `../`) of `CentralBankInstruction`.
2. THE Frontend_Repo SHALL import every Shared_Type used in any file under `apps/web/src/api/modules/` from the `@alsaqi/shared` package specifier, and SHALL contain zero relative-path imports (any import path beginning with `./` or `../`) and zero local re-definitions of those Shared_Types within `apps/web/src/api/modules/`.
3. IF a Shared_Type already exists in the Shared_Package, THEN THE Frontend_Repo SHALL contain no duplicate Local_Type definition for that Shared_Type in any file under `apps/web/src/types`.
4. THE Frontend_Repo SHALL produce a list in which each entry identifies one duplicate Local_Type by its type name and its containing file path, covering every duplicate Local_Type defined in `apps/web/src/api/modules/` or `apps/web/src/types` that also exists in the Shared_Package, such that no duplicate matching this condition is absent from the list.
5. WHEN a duplicate Local_Type from the criterion-4 list is removed, THE Frontend_Repo SHALL update every reference to that removed Local_Type to import the corresponding Shared_Type from the `@alsaqi/shared` package specifier.
6. WHEN the changes from criteria 1 through 5 are applied, THE Frontend_Repo SHALL complete the project's TypeScript build with zero TypeScript compilation errors.
7. IF the project's TypeScript build reports one or more compilation errors after the changes from criteria 1 through 5 are applied, THEN THE Frontend_Repo SHALL report each compilation error with its file path and line, and SHALL preserve the prior source state by not deleting any Local_Type whose references remain unresolved.

### Requirement 3: Move local Zod schemas into the shared package (FIX-FE-3)

**User Story:** As a frontend developer, I want validation schemas defined once in the Shared_Package, so that frontend response validation cannot silently drift from the server contract.

#### Acceptance Criteria

1. WHEN the schema relocation for FIX-FE-3 is performed, THE Frontend_Repo SHALL move the Zod_Schema `RiskItemSchema` from `apps/web/src/api/modules/risk-register.ts` into `packages/shared/src/validators/` with field definitions and validation rules identical to the original, AND SHALL remove the original `RiskItemSchema` definition from `apps/web/src/api/modules/risk-register.ts` such that no definition of `RiskItemSchema` remains outside `packages/shared/src/validators/`.
2. WHEN the schema relocation for FIX-FE-3 is performed, THE Frontend_Repo SHALL move the Zod_Schema `InstructionSchema` from `apps/web/src/api/modules/regulatory.ts` into `packages/shared/src/validators/` with field definitions and validation rules identical to the original, AND SHALL remove the original `InstructionSchema` definition from `apps/web/src/api/modules/regulatory.ts` such that no definition of `InstructionSchema` remains outside `packages/shared/src/validators/`.
3. WHEN the schema relocation for FIX-FE-3 is performed, THE Frontend_Repo SHALL move the Zod_Schema `DashboardStatsSchema` from `apps/web/src/api/modules/dashboard.ts` into `packages/shared/src/validators/` with field definitions and validation rules identical to the original, AND SHALL remove the original `DashboardStatsSchema` definition from `apps/web/src/api/modules/dashboard.ts` such that no definition of `DashboardStatsSchema` remains outside `packages/shared/src/validators/`.
4. WHEN the schema relocation for FIX-FE-3 is performed, THE Frontend_Repo SHALL move the Zod_Schemas `RoleSchema`, `PermissionSchema`, `SessionSchema`, `SettingsSchema`, and `JobTitleSchema` from `apps/web/src/api/modules/user-management.ts` into `packages/shared/src/validators/` with field definitions and validation rules identical to the originals, AND SHALL remove each original schema definition from `apps/web/src/api/modules/user-management.ts` such that no definition of any of these five schemas remains outside `packages/shared/src/validators/`.
5. WHEN a Zod_Schema is relocated to `packages/shared/src/validators/`, THE Frontend_Repo SHALL add exactly one corresponding Endpoint_Contract under `packages/shared/src/types/endpoints/` that references the relocated Shared_Validator.
6. WHEN a Zod_Schema is relocated, THE corresponding API_Module SHALL import that Shared_Validator from `@alsaqi/shared` AND SHALL NOT retain a local definition of that schema.
7. IF the schema relocation for FIX-FE-3 has not been agreed with the Backend_Team as recorded by Backend_Team approval on the change, THEN THE Frontend_Repo SHALL block the change from merging.
8. WHEN the schema relocation for FIX-FE-3 is complete, THE Frontend_Repo SHALL ensure that exactly one definition of each relocated schema exists across the repository, located in `packages/shared/src/validators/`.
9. WHEN the schema relocation for FIX-FE-3 is complete, THE Frontend_Repo SHALL ensure that all existing response-validation tests continue to pass.
10. WHERE the Backend_Team adds the corresponding Endpoint_Contracts (FIX-BE-5), THE Frontend_Repo SHALL consume those contracts from the single Shared_Validator source.

### Requirement 4: Remove TypeScript error suppression (FIX-FE-4)

**User Story:** As a frontend developer, I want the API layer to type-check without `@ts-expect-error` suppressions, so that type errors are surfaced rather than hidden.

#### Acceptance Criteria

1. THE Frontend_Repo SHALL remove every `@ts-expect-error` suppression that bypasses the `exactOptionalPropertyTypes` conflict in `apps/web/src/api/modules/dashboard.ts`, `apps/web/src/api/modules/risk-register.ts`, and `apps/web/src/api/modules/user-management.ts`.
2. WHERE a Zod_Schema validates a Shared_Type, THE Frontend_Repo SHALL either derive the type from the schema using `z.infer` or define the schema so that its inferred type is assignable to the Shared_Type under `exactOptionalPropertyTypes`, without manually annotating the schema as `z.ZodType<T>`.
3. THE `apps/web/src/api` layer SHALL contain zero `@ts-expect-error` suppressions.
4. WHEN every `@ts-expect-error` suppression has been removed from the `apps/web/src/api` layer, THE Frontend_Repo SHALL pass a TypeScript type-check run with `exactOptionalPropertyTypes` enabled and report zero TypeScript errors.
5. IF removing a suppression surfaces a genuine type mismatch, THEN THE Frontend_Repo SHALL resolve it by correcting the affected Zod_Schema or type definition and SHALL NOT reintroduce any suppression or type-bypass mechanism (`@ts-expect-error`, `@ts-ignore`, or `as any` / `as unknown` casts) to mask the conflict.
6. WHEN a suppression is removed from a Zod_Schema, THE Frontend_Repo SHALL preserve that schema's runtime validation behavior so that it accepts and rejects the same server responses as before the change.

### Requirement 5: Confirm API base URL and version config (FIX-FE-5)

**User Story:** As a frontend developer, I want the API base URL and version configuration confirmed across environments, so that the client targets the correct server origin and version.

#### Acceptance Criteria

1. WHERE a frontend environment is the development environment, THE `VITE_API_URL` value SHALL equal `http://localhost:3000/api`.
2. WHERE `VITE_API_URL` is unset or empty, THE HTTP_Client SHALL use the base URL `/api`.
3. THE API_Version_Constant in the Shared_Package SHALL equal the server's current API version expressed as a `MAJOR.MINOR` string, excluding any patch component.
4. WHEN the server returns a response that includes the `X-API-Version` response header, THE HTTP_Client SHALL compare the major and minor components of the header value against the API_Version_Constant, ignoring the patch component.
5. WHEN the server returns a Response_Envelope whose `success` field equals true and which contains a `data` field, THE HTTP_Client SHALL replace the response payload with the value of the `data` field.
6. IF the major or minor component of the `X-API-Version` header does not match the API_Version_Constant, THEN THE HTTP_Client SHALL display a non-dismissible version-mismatch notification indicating the expected and received versions.
7. IF a server response does not include the `X-API-Version` response header, THEN THE HTTP_Client SHALL perform no version comparison and SHALL display no version-mismatch notification.
8. IF a server response body is not a Response_Envelope with `success` equal to true and a `data` field, THEN THE HTTP_Client SHALL return the response payload unchanged.
