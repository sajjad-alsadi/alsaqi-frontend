// ==================== ObjectGuard.ts ====================
//
// NOTE (code-review-remediation, Requirement 11):
// This module previously overrode and froze `Object.defineProperty` process-wide
// and froze global primitives (JSON, Math, console, crypto.subtle). That global
// monkey-patching broke third-party libraries that legitimately define properties
// via `Object.defineProperty`, and provided no real security: the browser client
// is not a trust boundary, so any of these checks are trivially bypassable by an
// attacker who controls the page.
//
// The Backend remains the authoritative enforcer of integrity (CORS, TLS,
// server-side validation, output encoding, CSP). This module is now reduced to a
// no-op shim that preserves its public signatures so existing import sites
// (e.g. SecurityProvider.tsx) continue to compile. Any retained behavior is
// scoped to an explicit, caller-provided target rather than applied globally
// (Requirement 11.3).

export class ObjectGuard {
    private protectedObjects: Set<string>;

    constructor() {
        this.protectedObjects = new Set();
        // Intentionally no global overrides. Previously this froze global
        // primitives and replaced `Object.defineProperty`; that behavior is
        // removed (Requirement 11.1, 11.4).
    }

    /**
     * Narrowly-scoped protection for a caller-provided target only.
     *
     * This never touches global primitives. Callers may opt in to freezing a
     * specific object they own (Requirement 11.3 — scope behavior to a defined
     * target rather than applying it globally).
     *
     * @param obj     The object to protect. Globals are not accepted as targets.
     * @param methods Optional method names. When empty, the object itself is frozen.
     */
    protect(obj: unknown, methods: string[] = []) {
        if (!obj || typeof obj !== 'object') return;

        // Refuse to operate on global primitives — protection is opt-in for
        // caller-owned objects only.
        if (this.isGlobalTarget(obj)) return;

        if (methods.length === 0) {
            Object.freeze(obj);
            return;
        }

        const record = obj as Record<string, unknown>;
        methods.forEach((method) => {
            const descriptor = Object.getOwnPropertyDescriptor(record, method);
            if (!descriptor || typeof descriptor.value !== 'function') return;
            try {
                Object.defineProperty(record, method, {
                    ...descriptor,
                    writable: false,
                    configurable: false,
                });
                this.protectedObjects.add(method);
            } catch {
                // Ignore environments that disallow redefining the property.
            }
        });
    }

    private isGlobalTarget(obj: unknown): boolean {
        if (typeof window === 'undefined') return false;
        return (
            obj === JSON ||
            obj === Math ||
            obj === console ||
            obj === window ||
            (typeof window.crypto !== 'undefined' &&
                (obj === window.crypto || obj === window.crypto.subtle))
        );
    }
}

// Preserved factory signature. Returns an ObjectGuard instance that performs no
// global protection on construction.
export const initObjectGuard = () => {
    return new ObjectGuard();
};
