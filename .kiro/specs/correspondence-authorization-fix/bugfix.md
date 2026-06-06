# Bugfix Requirements Document

## Introduction

Critical security vulnerabilities (IDOR and Missing Authorization) were discovered in the Correspondence Module during Phase 4 audit. The system currently allows any authenticated user to access all correspondence endpoints regardless of their role/permissions, and enables users to access or modify correspondence records belonging to other departments by manipulating IDs in the URL. This fix addresses both route-level permission enforcement and service-layer row-level security.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN an authenticated user without 'Correspondence.View' permission calls GET /incoming, GET /outgoing, GET /archive, GET /stats, GET /details/:type/:id, or GET /attachments/:type/:id THEN the system returns data successfully (HTTP 200) instead of denying access

1.2 WHEN an authenticated user without 'Correspondence.Create' permission calls POST /incoming THEN the system creates the correspondence record successfully instead of denying access

1.3 WHEN an authenticated user without 'Correspondence.Edit' permission calls PUT /status/:type/:id, POST /refer, POST /link, PUT /archive/:type/:id, or POST /attachments THEN the system processes the request successfully instead of denying access

1.4 WHEN a regular user from Department A calls GET /incoming or GET /outgoing THEN the system returns ALL correspondence records system-wide including records belonging to Department B, Department C, etc.

1.5 WHEN a regular user from Department A calls GET /details/:type/:id with an ID belonging to Department B THEN the system returns the full correspondence details including attachments, history, and referrals

1.6 WHEN a regular user from Department A calls PUT /status/:type/:id or POST /refer with a record ID belonging to Department B THEN the system modifies the record successfully without ownership verification

1.7 WHEN a Manager user from Department A calls GET /incoming or GET /outgoing THEN the system returns ALL correspondence records system-wide including records from departments they do not manage

### Expected Behavior (Correct)

2.1 WHEN an authenticated user without 'Correspondence.View' permission calls any GET correspondence endpoint THEN the system SHALL return HTTP 403 Forbidden

2.2 WHEN an authenticated user without 'Correspondence.Create' permission calls POST /incoming THEN the system SHALL return HTTP 403 Forbidden

2.3 WHEN an authenticated user without 'Correspondence.Edit' permission calls PUT /status/:type/:id, POST /refer, POST /link, PUT /archive/:type/:id, or POST /attachments THEN the system SHALL return HTTP 403 Forbidden

2.4 WHEN a regular user from Department A calls GET /incoming THEN the system SHALL return only correspondence records where assigned_dept_id matches the user's department OR assigned_user_id matches the user's ID

2.5 WHEN a regular user from Department A calls GET /outgoing THEN the system SHALL return only outgoing correspondence records where created_by matches the user's ID OR the user's department matches the record's originating department

2.6 WHEN a regular user from Department A calls GET /details/:type/:id for a record belonging to Department B THEN the system SHALL return HTTP 403 Forbidden or HTTP 404 Not Found

2.7 WHEN a regular user calls PUT /status/:type/:id or POST /refer for a record not within their authorized scope THEN the system SHALL return HTTP 403 Forbidden

2.8 WHEN a Manager user from Department A calls GET /incoming or GET /outgoing THEN the system SHALL return only correspondence records belonging to their department (assigned_dept_id = user's department_id)

2.9 WHEN an Admin user calls any correspondence endpoint THEN the system SHALL return all records without row-level filtering (full system access)

### Unchanged Behavior (Regression Prevention)

3.1 WHEN an Admin user with full permissions calls any correspondence endpoint THEN the system SHALL CONTINUE TO return all records and process all operations without restriction

3.2 WHEN a user with 'Correspondence.View' permission calls GET /incoming for records within their authorized scope THEN the system SHALL CONTINUE TO return those records with pagination, search, and filter capabilities working correctly

3.3 WHEN a user with 'Correspondence.Create' permission calls POST /incoming with valid data THEN the system SHALL CONTINUE TO create the correspondence record and return the sequence number

3.4 WHEN a user with 'Correspondence.Edit' permission calls PUT /incoming/:id for a record within their scope THEN the system SHALL CONTINUE TO update the record and log the audit entry

3.5 WHEN a user with 'Correspondence.Delete' permission calls DELETE /incoming/:id for a record within their scope THEN the system SHALL CONTINUE TO delete the record with cascading cleanup of attachments, referrals, links, and status history

3.6 WHEN any authorized user creates or modifies correspondence THEN the system SHALL CONTINUE TO generate audit log entries via AuthService.logAudit

3.7 WHEN any authorized user creates correspondence THEN the system SHALL CONTINUE TO send automation events to N8n (n8nService.sendEvent)

3.8 WHEN routes that already have checkPermission middleware (PUT /incoming/:id, DELETE /incoming/:id, POST /outgoing, PUT /outgoing/:id, DELETE /outgoing/:id) are called by authorized users THEN the system SHALL CONTINUE TO process those requests normally

---

## Bug Condition (Formal Specification)

### Bug Condition Function

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type CorrespondenceRequest { userId, userRole, userDepartmentId, endpoint, method, targetRecordId }
  OUTPUT: boolean

  // Condition 1: Missing route-level authorization
  missingRouteAuth ← (X.endpoint IN [GET /incoming, POST /incoming, PUT /status/:type/:id, POST /refer, POST /link, PUT /archive/:type/:id, GET /archive, GET /attachments/:type/:id, POST /attachments, GET /stats, GET /details/:type/:id, GET /outgoing])
    AND user_lacks_permission(X.userId, 'Correspondence', required_action(X.endpoint))

  // Condition 2: IDOR - accessing records outside user's authorized scope
  idor ← (X.userRole != 'ADMIN')
    AND (X.targetRecordId IS NOT NULL)
    AND NOT record_belongs_to_user_scope(X.targetRecordId, X.userId, X.userDepartmentId, X.userRole)

  RETURN missingRouteAuth OR idor
END FUNCTION
```

### Property Specification (Fix Checking)

```pascal
// Property: Fix Checking - Route-Level Authorization
FOR ALL X WHERE isBugCondition(X) AND missingRouteAuth(X) DO
  result ← handleRequest'(X)
  ASSERT result.statusCode = 403
  ASSERT result.body.error = "Forbidden"
END FOR

// Property: Fix Checking - Row-Level Security (IDOR Prevention)
FOR ALL X WHERE isBugCondition(X) AND idor(X) DO
  result ← handleRequest'(X)
  ASSERT result.statusCode IN {403, 404}
  ASSERT result.body DOES NOT contain target record data
END FOR
```

### Preservation Property

```pascal
// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT handleRequest(X) = handleRequest'(X)
END FOR
```

This ensures that for all authorized requests within the user's legitimate scope, the fixed code behaves identically to the original.
