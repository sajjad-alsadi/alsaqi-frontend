import { useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export const useIdleTimeout = () => {
  const { user, logout } = useAppContext();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (user) {
      timeoutRef.current = setTimeout(() => {
        // Store a flag in sessionStorage to show a specific message on login screen
        try {
          sessionStorage.setItem('idle_logout', 'true');
        } catch (e) {}
        logout();
      }, IDLE_TIMEOUT_MS);
    }
  };

  useEffect(() => {
    if (!user) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      return;
    }

    // Set initial timeout
    resetTimeout();

    // Events to track user activity
    const events = ['mousemove', 'keydown', 'wheel', 'DOMMouseScroll', 'mouseWheel', 'mousedown', 'touchstart', 'touchmove', 'MSPointerDown', 'MSPointerMove'];

    const handleActivity = () => {
      resetTimeout();
    };

    // Attach event listeners
    events.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [user, logout]); // Re-run if user logs in/out
};
