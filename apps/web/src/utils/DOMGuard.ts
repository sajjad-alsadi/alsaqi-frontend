// ==================== DOMGuard.ts ====================

export interface DOMGuardConfig {
    sensitiveSelectors?: string[];
    blockedAttributes?: string[];
}

export class DOMGuard {
    private sensitiveSelectors: string[];
    private blockedAttributes: string[];
    private observer: MutationObserver | null = null;
    private initialized = false;

    constructor(config: DOMGuardConfig = {}) {
        this.sensitiveSelectors = config.sensitiveSelectors || [
            'input[type="password"]',
            '[data-sensitive]',
            'form[action*="login"]',
            'form[action*="payment"]'
        ];
        this.blockedAttributes = config.blockedAttributes || [
            'onerror',
            'onload',
            'onclick',
            'onmouseover'
        ];
        
        // Ensure this runs only in browser context once
        if (typeof document !== 'undefined' && !(window as any).__domGuardInitialized) {
            this.startMonitoring();
            (window as any).__domGuardInitialized = true;
            this.initialized = true;
        }
    }

    private startMonitoring() {
        const self = this;

        this.observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                // كشف العناصر المضافة
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        self.scanElement(node as Element);
                        self.scanDescendants(node as Element);
                    }
                });

                // كشف تغييرات الخصائص
                if (mutation.type === 'attributes') {
                    self.checkAttributeChange(
                        mutation.target as Element,
                        mutation.attributeName as string,
                        mutation.oldValue
                    );
                }
            });
        });

        this.observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeOldValue: true
        });
    }

    private scanElement(element: Element) {
        // التحقق من العناصر الحساسة
        this.sensitiveSelectors.forEach(selector => {
            if (element.matches && element.matches(selector)) {
                this.protectSensitiveElement(element as HTMLElement);
            }
        });

        // كشف السكريبتات المحقونة
        if (element.tagName === 'SCRIPT') {
            const script = element as HTMLScriptElement;
            if (!script.src || this.isExternalScript(script.src)) {
                console.warn('[Security] Suspicious script detected:', element);
                this.handleThreat('injected_script', element);
            }
        }

        // كشف الإطارات المخفية
        if (element.tagName === 'IFRAME') {
            const iframe = element as HTMLIFrameElement;
            const style = window.getComputedStyle(iframe);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                console.warn('[Security] Hidden iframe detected:', iframe.src);
                this.handleThreat('hidden_iframe', element);
            }
        }
    }

    private scanDescendants(parent: Element) {
        if (!parent.querySelectorAll) return;
        
        this.sensitiveSelectors.forEach(selector => {
            parent.querySelectorAll(selector).forEach(el => {
                this.protectSensitiveElement(el as HTMLElement);
            });
        });
    }

    private protectSensitiveElement(element: HTMLElement) {
        // منع تسجيل المدخلات
        const tagName = element.tagName;
        if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
            // كشف keyloggers المحتملة
            const originalAddEventListener = element.addEventListener.bind(element);
            
            element.addEventListener = function(type: string, handler: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
                if (type === 'input' || type === 'keyup' || type === 'keydown') {
                    const handlerStr = typeof handler === 'function' ? handler.toString() : '';
                    if (handlerStr.includes('fetch') || handlerStr.includes('XMLHttpRequest')) {
                        console.error('[Security] Potential keylogger detected on sensitive input');
                        return; // حظر التسجيل
                    }
                }
                return originalAddEventListener(type, handler, options);
            };
        }

        // إضافة طبقة حماية مرئية في وضع التصحيح
        if ((window as any).DEBUG_MODE) {
            element.style.outline = '2px solid green';
            element.dataset.protected = 'true';
        }
    }

    private checkAttributeChange(element: Element, attrName: string, oldValue: string | null) {
        const newValue = element.getAttribute(attrName);

        // كشف حقن inline handlers
        if (this.blockedAttributes.includes(attrName)) {
            console.error(`[Security] Blocked dangerous attribute: ${attrName}=${newValue}`);
            element.removeAttribute(attrName);
            this.handleThreat('dangerous_attribute', { element, attrName, newValue });
        }

        // كشف تغيير action في النماذج
        if (attrName === 'action' && element.tagName === 'FORM') {
            let oldHost = '';
            let newHost = '';
            try {
                oldHost = oldValue ? new URL(oldValue, window.location.href).host : '';
                newHost = newValue ? new URL(newValue, window.location.href).host : '';
            } catch (e) {
                // Invalid URL
            }
            
            if (oldHost !== newHost) {
                console.error(`[Security] Form action hijacked: ${oldValue} -> ${newValue}`);
                if (oldValue !== null) {
                    element.setAttribute('action', oldValue); // استعادة القيمة
                } else {
                    element.removeAttribute('action');
                }
                this.handleThreat('form_hijacking', element);
            }
        }
    }

    private isExternalScript(src: string): boolean {
        try {
            const url = new URL(src, window.location.href);
            // In dev mode (vite), scripts from localhost with different ports might be loaded, 
            // but usually window.location.origin handles it.
            return url.origin !== window.location.origin;
        } catch {
            return true;
        }
    }

    private handleThreat(type: string, details: any) {
        // إرسال تنبيه
        try {
            fetch('/api/security/threat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type,
                    details: this.serializeDetails(details),
                    timestamp: new Date().toISOString(),
                    url: window.location.href
                })
            }).catch(() => {});
        } catch (e) {
            // Ignore fetch errors during threat reporting
        }
    }

    private serializeDetails(details: any) {
        if (details instanceof Element) {
            return {
                tagName: details.tagName,
                id: details.id,
                className: details.className,
                outerHTML: details.outerHTML.slice(0, 500)
            };
        }
        return details;
    }

    destroy() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.initialized) {
            (window as any).__domGuardInitialized = false;
        }
    }
}

// يمكن تهيئة وتصدير نسخة افتراضية تعمل عند الحاجة
export const initDOMGuard = (config?: DOMGuardConfig) => {
    return new DOMGuard(config);
};
