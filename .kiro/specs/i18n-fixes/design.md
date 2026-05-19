# Design

## Overview

This design addresses translation issues in the Al-Saqi internal audit system across 5 phases. The core strategy is: all user-facing text must pass through i18next `t()`, and the server sends translation keys instead of hardcoded text.

## Architecture

The translation system follows a client-side rendering pattern where the server stores translation keys with interpolation parameters, and the client resolves them at display time using i18next.

## Components and Interfaces

The system modifies locale files (ar.json, en.json), server notification utilities, export services (PDF/DOCX), and UI components to use centralized translation keys.

## Data Models

Notifications are stored as JSON strings containing a `key` and optional `params` object. Legacy plain-text notifications are supported via try/catch fallback parsing.

## Correctness Properties

### Property 1: Translation Key Existence

For any translation key used in source code, that key must exist in both ar.json and en.json.

**Validates: Requirements 1**

### Property 2: Notification Round-Trip

For any notification encoded as JSON with key and params, translateNotification() must produce a non-empty translated string.

**Validates: Requirements 3**

### Property 3: Structural Integrity

For any key in locale files, no duplicate exists at a different nesting level, and all keys follow camelCase naming.

**Validates: Requirements 7**

## Error Handling

Legacy notifications use try/catch on JSON.parse with plain-text fallback. Missing keys return the key itself via i18next default behavior. Missing interpolation variables render without error.

## Testing Strategy

Unit tests verify translateNotification handles JSON, legacy, and malformed input. Property-based tests with fast-check validate key existence and round-trip translation. Integration tests confirm npm run build passes and locale files stay synchronized.
