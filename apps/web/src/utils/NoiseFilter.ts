// ==================== NoiseFilter.ts ====================
// كتم أخطاء WebSocket المتوقعة والناتجة عن Vite في بيئة التطوير فقط

export const initNoiseFilter = () => {
    const isViteNoise = (msg: any) => {
        if (typeof msg !== 'string') return false;
        const lowerMsg = msg.toLowerCase();
        return (lowerMsg.includes('vite') || lowerMsg.includes('hmr')) && 
               (lowerMsg.includes('websocket') || lowerMsg.includes('connection failed') || lowerMsg.includes('closed without opened'));
    };

    window.addEventListener('unhandledrejection', (event) => {
        const message = event.reason?.message || event.reason;
        if (isViteNoise(message)) {
            event.preventDefault();
        }
    });

    window.addEventListener('error', (event) => {
        const message = event.message || event.error?.message;
        if (isViteNoise(message)) {
            event.preventDefault();
            event.stopPropagation();
        }
    }, true);
};
