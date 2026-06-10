// ==================== SecureNetwork.ts ====================
import { CryptoUtils } from './CryptoUtils';

export interface SecureNetworkConfig {
    allowedOrigins?: string[];
    blockedPatterns?: RegExp[];
}

export class SecureNetwork {
    private allowedOrigins: string[];
    private blockedPatterns: RegExp[];
    private hmacKey: CryptoKey | null = null;
    private ready: Promise<void>;

    constructor(config: SecureNetworkConfig = {}) {
        this.allowedOrigins = config.allowedOrigins || [window.location.origin];
        this.blockedPatterns = config.blockedPatterns || [
            /<script/i,
            /onerror=/i,
            /javascript:/i
        ];
        this.ready = this.initKeys();
        
        if (typeof window !== 'undefined' && !(window as any).__secureNetworkInitialized) {
            this.initInterceptors();
            (window as any).__secureNetworkInitialized = true;
        }
    }

    private async initKeys() {
        // Derive key from env variable; in production VITE_NETWORK_SECRET must be set
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const env = (import.meta as any).env as Record<string, string> | undefined;
        const baseKey = env?.['VITE_NETWORK_SECRET'] || 
            (typeof window !== 'undefined' ? `${window.location.origin}-${navigator.userAgent.slice(0, 32)}` : 'dev-only-key');
        this.hmacKey = await CryptoUtils.importHMACKey(baseKey);
    }

    private initInterceptors() {
        const self = this;
        const originalFetch = window.fetch;

        try {
            Object.defineProperty(window, 'fetch', {
                value: async function(input: RequestInfo | URL, init?: RequestInit) {
                    await self.ready;
                    const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
                    let options = init || {};

                    try {
                        // Ensure absolute URL for safety check
                        const targetUrl = new URL(url, window.location.origin);
                        
                        if (!self.isAllowedOrigin(targetUrl.origin)) {
                            console.error(`[Security] Blocked unauthorized origin: ${targetUrl.origin}`);
                            throw new Error('Unauthorized request origin');
                        }

                        // XSS Payload detection
                        if (options.body && typeof options.body === 'string') {
                            if (self.containsBlockedPattern(options.body)) {
                                throw new Error('Request payload blocked for security');
                            }
                        }

                        // Sign request
                        const secureOptions = await self.signRequest(options);
                        const response = await originalFetch.call(this, input, secureOptions);
                        
                        // Integrity check for text responses
                        const clonedResp = response.clone();
                        const contentType = response.headers.get('content-type');
                        if (contentType && (contentType.includes('json') || contentType.includes('text'))) {
                            const body = await clonedResp.text();
                            const signature = response.headers.get('x-response-signature');
                            
                            if (signature && !(await self.verifyResponse(body, signature))) {
                                throw new Error('Response integrity check failed');
                            }
                        }

                        return response;
                    } catch (error: any) {
                        console.warn('[Security] Network Guard:', error.message);
                        throw error;
                    }
                },
                configurable: true,
                enumerable: true,
                writable: true
            });
        } catch (e) {
            console.warn('[Security] Could not override window.fetch, skipping network interceptor.', e);
        }

        // Protected XHR
        try {
            const OriginalProt = window.XMLHttpRequest.prototype;
            const originalSend = OriginalProt.send;
            const originalOpen = OriginalProt.open;

            OriginalProt.open = function(method: string, url: string | URL, ...rest: any[]) {
                (this as any).__method = method;
                (this as any).__url = url;
                return originalOpen.apply(this, [method, url, ...rest] as any);
            };
            
            OriginalProt.send = function(body?: any) {
                if (body && typeof body === 'string' && self.containsBlockedPattern(body)) {
                    console.error('[Security] XHR Content blocked');
                    throw new Error('XHR Content blocked');
                }

                // We can't easily wait for self.ready here without making it async, 
                // but for blocking patterns we don't need the key.
                return originalSend.apply(this, arguments as any);
            };
        } catch (e) {
            console.warn('[Security] Could not override XMLHttpRequest, skipping XHR interceptor.', e);
        }
    }

    private isAllowedOrigin(origin: string) {
        return this.allowedOrigins.some(allowed => origin.startsWith(allowed));
    }

    private containsBlockedPattern(data: string) {
        return this.blockedPatterns.some(pattern => pattern.test(data));
    }

    private async signRequest(options: RequestInit): Promise<RequestInit> {
        if (!this.hmacKey) return options;
        const ts = Date.now().toString();
        const nonce = crypto.randomUUID();
        const signature = await CryptoUtils.sign(`${ts}:${nonce}`, this.hmacKey);
        
        return {
            ...options,
            headers: {
                ...(options.headers || {}),
                'x-sec-ts': ts,
                'x-sec-nonce': nonce,
                'x-sec-sig': signature
            }
        };
    }

    private async verifyResponse(body: string, signature: string) {
        if (!this.hmacKey) return true;
        return await CryptoUtils.verify(body, signature, this.hmacKey);
    }
}

export const initSecureNetwork = (config?: SecureNetworkConfig) => new SecureNetwork(config);
