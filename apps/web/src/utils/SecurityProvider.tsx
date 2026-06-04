
import React, { createContext, useContext, useEffect, useState } from 'react';
import { initSecureNetwork } from './SecureNetwork';
import { initDOMGuard } from './DOMGuard';
import { initNoiseFilter } from './NoiseFilter';
import { initObjectGuard } from './ObjectGuard';
import { securityLogger } from './SecurityLogger';

interface SecurityContextType {
    isReady: boolean;
    reportEvent: (type: string, details: any) => void;
}

const SecurityContext = createContext<SecurityContextType | null>(null);

export const SecurityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        const initializeSecurity = async () => {
            const steps = [
                { name: 'Noise Filter', fn: initNoiseFilter },
                { 
                    name: 'Network Security', 
                    fn: () => initSecureNetwork({
                        allowedOrigins: [window.location.origin]
                    })
                },
                { name: 'Object Protection', fn: initObjectGuard },
                { name: 'DOM Protection', fn: initDOMGuard }
            ];

            for (const step of steps) {
                try {
                    step.fn();
                    securityLogger.info(`Security Step: ${step.name} initialized`);
                } catch (error) {
                    securityLogger.error(`Security Initialization Failed at: ${step.name}`, error);
                    // Continue with other steps
                }
            }
            
            securityLogger.info('Security System Initialization Check Complete');
            setIsReady(true);
        };

        initializeSecurity();
    }, []);

    const reportEvent = (type: string, details: any) => {
        securityLogger.warn(`Security Event: ${type}`, details);
    };

    return (
        <SecurityContext.Provider value={{ isReady, reportEvent }}>
            {children}
        </SecurityContext.Provider>
    );
};

export const useSecurity = () => {
    const context = useContext(SecurityContext);
    if (!context) {
        throw new Error('useSecurity must be used within a SecurityProvider');
    }
    return context;
};
