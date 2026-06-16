// ==================== SecureNetwork.ts ====================
//
// Network-layer monkey-patching has been removed (code-review remediation, Req 1, 2).
//
// Previously this module overrode `window.fetch` and `XMLHttpRequest.prototype`
// to enforce an origin allow-list, block request bodies containing substrings
// such as `<script`, `onerror=`, or `javascript:`, and buffer response bodies
// via `response.clone().text()` for "integrity" checks. Those client-side
// controls broke legitimate cross-origin requests and streaming responses,
// rejected valid free-text payloads, and provided no real protection because
// the client is not a trust boundary.
//
// The Backend remains the authoritative enforcer of request origin and
// transport integrity (CORS, TLS) and the authoritative validator of request
// payloads. This module is now a behavior-free shim that preserves its public
// surface so existing import sites continue to compile.

export interface SecureNetworkConfig {
    allowedOrigins?: string[];
    blockedPatterns?: RegExp[];
}

/**
 * No-op shim retained for backwards compatibility with existing import sites.
 *
 * Constructing this class no longer installs any global interceptors and does
 * not alter `window.fetch` or `XMLHttpRequest` behavior.
 */
export class SecureNetwork {
    constructor(_config: SecureNetworkConfig = {}) {
        // Intentionally empty: no global interception is installed.
        void _config;
    }

    /**
     * Retained as a no-op for backwards compatibility. Global request
     * interception has been removed; the Backend enforces origin/transport
     * controls and payload validation.
     */
    initInterceptors(): void {
        // no-op
    }
}

export const initSecureNetwork = (config?: SecureNetworkConfig): SecureNetwork =>
    new SecureNetwork(config);
