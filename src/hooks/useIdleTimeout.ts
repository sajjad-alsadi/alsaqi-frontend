import { useEffect, useRef, useState } from 'react';
import { useUser } from '../context/UserContext';
import { useAppContext } from '../context/AppContext';
import api from '../services/api';

const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes fallback

export const useIdleTimeout = () => {
  const { user } = useUser();
  const { logout } = useAppContext();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [timeoutMs, setTimeoutMs] = useState(DEFAULT_IDLE_TIMEOUT_MS);

  // Fetch session_timeout_minutes from server settings
  useEffect(() => {
    if (!user) return;
    api.get('/session-config')
      .then(res => {
        const minutes = res.data?.session_timeout_minutes;
        if (minutes && minutes > 0) {
          setTimeoutMs(minutes * 60 * 1000);
        }
      })
      .catch(() => { /* use default */ });
  }, [user]);

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
      }, timeoutMs);
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
  }, [user, logout, timeoutMs]);
};
