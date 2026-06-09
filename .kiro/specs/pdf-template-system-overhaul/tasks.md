# Implementation Plan: PDF Template System Overhaul

## Overview

This plan implements the PDF template system overhaul for the ALSAQI application. The implementation unifies duplicate PDF template services, replaces html2canvas with server-side Puppeteer rendering, fixes template type key mismatches, connects the Worker to stored templates, adds a template editor with live preview, and includes database migration, report status tracking, template security, and Puppeteer resource management.

## Tasks

- [x] 1. Define shared constants and types
  - [x] 1.1 Create TemplateTypeRegistry constants and types
    - Create `packages/api/src/constants/templateTypes.ts`
    - Define `TemplateTypeKey` union type with all 8 keys
    - Define `TemplateTypeDefinition` interface with `key`, `i18nLabel`, `defaultTemplate`
    - Export `TEMPLATE_TYPES` constant array with all 8 definitions
    - Export `isValidTemplateTypeKey` type guard function
    - Export `resolveTemplateTypeKey` function with full legacy mapping (Arabic labels, English camelCase keys, fallback to 'general')
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 1.2 Write property test for resolveTemplateTypeKey
    - **Property 2: resolveTemplateTypeKey always returns a valid key**
    - Use fast-check to verify any arbitrary string input always returns a value from the 8 defined TemplateTypeKey constants
    - Test that recognized Arabic labels map correctly
    - Test that legacy camelCase keys map correctly
    - Test that empty string, null-like inputs return 'general'
    - **Validates: Requirements 3.2, 3.5, 3.7, 3.8**

  - [x] 1.3 Create PdfTemplate and PdfSettings interfaces
    - Create `packages/api/src/types/pdf.ts`
    - Define `PdfTemplate` interface (with boolean `is_default`)
    - Define `PdfTemplateRow` interface (with numeric `is_default`)
    - Define `PdfSettings` and `PdfSettingsRow` interfaces
    - Define `RenderOptions`, `PdfResult`, `CreateTemplateDto`, `UpdateTemplateDto`
    - Implement `mapRowToTemplate` and `mapRowToSettings` mapper functions
    - _Requirements: 1.5, 4.1_

  - [x] 1.4 Write property test for mapRowToTemplate is_default conversion
    - **Property 8: is_default number ↔ boolean conversion**
    - Use fast-check to verify that for any row where is_default = 0 or 1, mapRowToTemplate returns false or true respectively
    - **Validates: Requirements 1.5**

- [x] 2. Database migration
  - [x] 2.1 Create migration file for template_type_key column
    - Create migration file adding `template_type_key VARCHAR(50)` column
    - Populate using CASE statement mapping Arabic/English labels to snake_case keys
    - Set unmapped/NULL/empty values to 'general'
    - ALTER column to NOT NULL after population
    - Create partial composite index on `(template_type_key, status)` filtered by `is_default = 1`
    - Create unique partial index on `(template_type_key)` filtered by `is_default = 1 AND status = 'Approved'`
    - Preserve original `template_type` column unchanged
    - Wrap all operations in a single transaction for rollback safety
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

- [x] 3. Implement unified PdfTemplateService
  - [x] 3.1 Create PdfTemplateService with CRUD operations
    - Create `packages/api/src/services/PdfTemplateService.ts`
    - Implement `getAll()` returning all templates with boolean mapping
    - Implement `getById(id)` with error handling for not found
    - Implement `getActiveByType(typeKey)` returning the default approved template or null
    - Implement `create(data, username)` with version=1, timestamps, validation (name ≤200 chars, content ≤500KB, valid typeKey)
    - Implement `update(id, data, username)` with conditional version increment (only on content change), timestamps
    - Implement `delete(id, username)` with protection against deleting default approved templates
    - Ensure only one default per type: on setDefault, unset previous default first
    - Use `mapRowToTemplate` for all returned data
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.3, 2.4, 2.5, 9.3_

  - [x] 3.2 Write property test for default template uniqueness
    - **Property 1: One default template per type**
    - Use fast-check to verify that after any sequence of setDefault operations for the same TemplateTypeKey, at most one template has is_default=true and status='Approved'
    - **Validates: Requirements 2.1, 2.3**

  - [x] 3.3 Write property test for version increment on update
    - **Property 9: Version increment and audit trail**
    - Use fast-check to verify that for any template at version N, an update to content produces version N+1 with correct updated_by and recent updated_at
    - **Validates: Requirements 1.3, 1.4**

  - [x] 3.4 Write property test for template content size limit
    - **Property 7: Content size limit enforcement**
    - Use fast-check to verify that content exceeding 500KB is rejected and content ≤500KB is accepted
    - **Validates: Requirements 9.3**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement PdfEngine with Puppeteer
  - [x] 5.1 Create browser pool manager
    - Create `packages/api/src/services/BrowserPool.ts`
    - Use `generic-pool` to manage Puppeteer browser instances
    - Set max pool size to 3 concurrent instances
    - Track page render count per instance, recycle after 50 pages
    - Implement lazy initialization (first request triggers pool creation)
    - Implement `dispose()` to close all browsers within 10 seconds
    - Handle crashed/unresponsive instances: remove from pool, create replacement
    - Queue requests when all instances busy, timeout after 30 seconds
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 10.7_

  - [x] 5.2 Create PdfEngine service
    - Create `packages/api/src/services/PdfEngine.ts`
    - Implement `renderFromTemplate(options)`: compile Handlebars → wrapWithStyles → Puppeteer page.pdf()
    - Implement `renderFallback(options)`: use built-in fallback template → same pipeline
    - Implement `compilePreviewHtml(htmlContent, data, settings, language)`: synchronous Handlebars compile, return {compiledHtml, errors}
    - Implement `dispose()`: delegate to browser pool
    - Apply 30-second timeout with one retry for Puppeteer rendering
    - On template compilation error, fall back to built-in fallback and log warning
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.9, 4.10, 4.11, 6.3, 6.4, 6.5, 6.7_

  - [x] 5.3 Implement wrapWithStyles and HTML sanitization
    - Create `packages/api/src/services/pdfHelpers.ts`
    - Implement `wrapWithStyles(bodyHtml, settings, language)`: full HTML document with RTL, fonts, margins, print styles
    - Implement `sanitizeHtml(content)`: remove script, iframe, on-event attributes using sanitize-html
    - Implement `buildHeaderTemplate(settings)` and `buildFooterTemplate(settings, language)`
    - Block external network requests via Puppeteer request interception
    - _Requirements: 4.6, 4.7, 4.8, 9.1, 9.2_

  - [x] 5.4 Write property test for HTML sanitization
    - **Property 5: Sanitization removes dangerous elements**
    - Use fast-check to generate HTML strings containing script/iframe/on-event attributes and verify they are removed after sanitization
    - **Validates: Requirements 9.1**

  - [x] 5.5 Write property test for renderFromTemplate PDF validity
    - **Property 3: renderFromTemplate produces structurally valid PDF**
    - Use fast-check to verify that for any valid RenderOptions, the result has buffer.length > 0, starts with '%PDF-', and fileSize === buffer.length
    - **Validates: Requirements 4.1, 4.2, 4.3**

  - [x] 5.4b Implement LRU cache for compiled Handlebars templates
    - Add LRU cache (max 100 entries) keyed by `templateId:version`
    - Integrate with PdfEngine.renderFromTemplate to check cache before compiling
    - _Requirements: 10.5_

  - [x] 5.5b Create fallback templates for all 8 types
    - Create `packages/api/src/constants/fallbackTemplates.ts`
    - Implement `FALLBACK_TEMPLATES` Record with HTML for each TemplateTypeKey
    - Implement `buildFallbackHtml(data, language, templateTypeKey)` function
    - _Requirements: 4.5, 5.3_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Update Worker and report status tracking
  - [x] 7.1 Update generate-pdf Worker to use stored templates
    - Modify `generate-pdf.worker.ts` to use PdfTemplateService.getActiveByType
    - Fetch PDF settings via SettingsService
    - Use PdfEngine.renderFromTemplate (or renderFallback if no template found)
    - Upload result to MinIO under `audits/{auditId}/reports/{reportId}.pdf`
    - Update report record to status='ready' with storage_key and file_size
    - Handle missing audit data: mark report failed, throw UnrecoverableError
    - Handle template compilation errors: fall back to renderFallback with warning log
    - Handle storage upload failure: allow BullMQ retry without updating status to 'ready'
    - After 3 failed attempts: update report status to 'failed' with error message
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.8, 5.9, 8.2, 8.3_

  - [x] 7.2 Create report generation API endpoint and status tracking
    - Create `POST /reports/generate` endpoint: create report record with status 'pending', queue BullMQ job, respond 202 with reportId
    - Create `GET /reports/:reportId/status` endpoint: return current status, downloadUrl (if ready), errorMessage (if failed)
    - Implement 5-minute timeout: mark reports stuck in 'pending' as 'failed'
    - _Requirements: 5.7, 8.1, 8.4, 8.5, 8.6_

  - [x] 7.3 Write property test for report status finality
    - **Property 4: Report status always reaches a terminal state**
    - Use fast-check to verify that for any job (with or without valid audit data), the report status eventually reaches 'ready' or 'failed' and never remains 'pending' indefinitely
    - **Validates: Requirements 8.5, 5.5, 5.6**

- [x] 8. Implement template editor frontend
  - [x] 8.1 Create PdfTemplateEditor component with code editor
    - Create `apps/web/src/components/PdfTemplateEditor.tsx`
    - Integrate CodeMirror or Monaco editor with HTML/Handlebars syntax highlighting
    - Add template type selector using TEMPLATE_TYPES from shared constants
    - Add template name input, status selector, is_default toggle
    - Add sample data editor (JSON textarea) for preview
    - Implement debounced preview request (800ms delay) on content change
    - _Requirements: 6.1, 6.2_

  - [x] 8.2 Implement live preview with two-level strategy
    - Add iframe sandbox displaying compiled HTML (Level 1: fast preview)
    - Call `POST /pdf-templates/preview-html` for Handlebars compilation
    - Display syntax errors from response in editor UI
    - Add "Preview PDF" button calling `POST /pdf-templates/preview-pdf` (Level 2: accurate preview)
    - Handle preview timeout/failure with error message, preserve editor content
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [x] 8.3 Create preview API endpoints with rate limiting
    - Create `POST /pdf-templates/preview-html` endpoint: calls compilePreviewHtml, returns {compiledHtml, errors}
    - Create `POST /pdf-templates/preview-pdf` endpoint: calls PdfEngine.renderFromTemplate, returns PDF blob
    - Implement rate limiting: 10 preview requests/minute/user
    - _Requirements: 6.3, 6.6, 9.4_

  - [x] 8.4 Write property test for compilePreviewHtml correctness
    - **Property 6: compilePreviewHtml compilation and error handling**
    - Use fast-check to verify: valid Handlebars + data → HTML contains data values + empty errors; invalid Handlebars → non-empty errors + HTML contains error description
    - **Validates: Requirements 6.3, 6.4, 6.5**

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Integration and wiring
  - [x] 10.1 Update frontend report generation to use server-side PDF
    - Update `useReports.ts` to call `POST /reports/generate` with templateTypeKey instead of local html2canvas rendering
    - Implement `pollReportStatus` utility with 3-second interval and 5-minute timeout
    - Update UI to show pending/ready/failed status indicators
    - Remove html2canvas client-side PDF generation code paths
    - _Requirements: 5.7, 8.1, 8.4, 8.6_

  - [x] 10.2 Remove duplicate service and old dependencies
    - Remove the duplicate PdfTemplateService from `src/server/` (keep only `packages/api/`)
    - Update all imports to use the unified service
    - Remove `html2canvas` usage from client-side report generation
    - Keep `jsPDF`/`jspdf-autotable` as emergency fallback only (not primary path)
    - _Requirements: 1.1, 4.1_

  - [x] 10.3 Wire template management pages to unified service
    - Update `PdfTemplateManagement` component to use TemplateTypeKey constants
    - Replace Arabic/English text-based type selection with key-based selection from TEMPLATE_TYPES
    - Update API calls to pass `template_type_key` instead of translated `template_type`
    - _Requirements: 3.1, 3.6_

  - [x] 10.4 Write integration tests for end-to-end flow
    - Test: create template → approve → set default → generate report → verify PDF output
    - Test: Worker with active template vs. fallback template
    - Test: preview-html endpoint with valid and invalid Handlebars
    - Test: migration correctly maps old Arabic/English values
    - _Requirements: 1.1, 4.1, 5.1, 5.3, 7.2_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation uses TypeScript throughout (matching the existing codebase)
- fast-check is the property-based testing library specified in the design
- Browser pool uses generic-pool for Puppeteer instance management
- CodeMirror or Monaco editor choice can be finalized during implementation based on bundle size considerations

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3"] },
    { "id": 1, "tasks": ["1.2", "1.4", "2.1"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4"] },
    { "id": 4, "tasks": ["5.1", "5.5b"] },
    { "id": 5, "tasks": ["5.2", "5.3"] },
    { "id": 6, "tasks": ["5.4", "5.5", "5.4b"] },
    { "id": 7, "tasks": ["7.1", "7.2"] },
    { "id": 8, "tasks": ["7.3", "8.1"] },
    { "id": 9, "tasks": ["8.2", "8.3"] },
    { "id": 10, "tasks": ["8.4"] },
    { "id": 11, "tasks": ["10.1", "10.2", "10.3"] },
    { "id": 12, "tasks": ["10.4"] }
  ]
}
```
