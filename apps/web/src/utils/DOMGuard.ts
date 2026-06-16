// ==================== DOMGuard.ts ====================
//
// NOTE (code-review-remediation, Requirement 11):
// This module previously ran a document-wide MutationObserver (observing
// `document.documentElement` with `subtree: true`) that, among other things,
// inspected event-handler `toString()` output on sensitive inputs to "detect
// keyloggers", stripped attributes, and rewrote form actions across the entire
// page. That observer was a performance and correctness hazard, broke legitimate
// DOM behavior, and provided no real security — the browser client is not a
// trust boundary, so any such check is trivially bypassable.
//
// The Backend remains the authoritative enforcer (server-side validation, output
// encoding, CSP). This module is now reduced to a no-op shim that preserves its
// public signatures so existing import sites (e.g. SecurityProvider.tsx) continue
// to compile. No document-wide MutationObserver is registered (Requirement 11.2).
// Any retained behavior would be scoped to a defined target rather than applied
// globally (Requirement 11.3).

export interface DOMGuardConfig {
    sensitiveSelectors?: string[];
    blockedAttributes?: string[];
}

export class DOMGuard {
    private sensitiveSelectors: string[];
    private blockedAttributes: string[];
    // Retained for API compatibility; no observer is ever created.
    private observer: MutationObserver | null = null;

    constructor(config: DOMGuardConfig = {}) {
        this.sensitiveSelectors = config.sensitiveSelectors || [];
        this.blockedAttributes = config.blockedAttributes || [];
        // Intentionally no monitoring. The previous document-wide
        // MutationObserver (and its handler `toString()` keylogger inspection)
        // is removed (Requirement 11.2).
    }

    /** Configured sensitive selectors (exposed for inspection only). */
    getSensitiveSelectors(): readonly string[] {
        return this.sensitiveSelectors;
    }

    /** Configured blocked attributes (exposed for inspection only). */
    getBlockedAttributes(): readonly string[] {
        return this.blockedAttributes;
    }

    /** No-op teardown preserved for API compatibility. */
    destroy() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }
}

// Preserved factory signature. Returns a DOMGuard instance that registers no
// observers.
export const initDOMGuard = (config?: DOMGuardConfig) => {
    return new DOMGuard(config);
};
