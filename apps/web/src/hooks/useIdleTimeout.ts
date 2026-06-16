import { useEffect, useRef, useState } from 'react';
import { useUser } from '../context/UserContext';
import { useAppContext } from '../context/AppContext';
import api from '../api/httpClient';

const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes fallback

// Minimum interval between idle-timer re-arms triggered by activity events.
// High-frequency events (e.g. mousemove) can fire dozens of times per second;
// leading-edge throttling re-arms the timer at most once per interval (Req 27).
const ACTIVITY_THROTTLE_MS = 1000;

export const useIdleTimeout = () => {
  const { user } = useUser();
  const { logout } = useAppContext();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityArmRef = useRef<number>(0);
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
        } catch {}
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
    lastActivityArmRef.current = Date.now();

    // Events to track user activity
    const events = ['mousemove', 'keydown', 'wheel', 'DOMMouseScroll', 'mouseWheel', 'mousedown', 'touchstart', 'touchmove', 'MSPointerDown', 'MSPointerMove'];

    // Leading-edge throttle: continuous high-frequency events (mousemove) re-arm
    // the idle timer at most once per ACTIVITY_THROTTLE_MS, and re-arm again once
    // the interval has elapsed (Req 27.1, 27.2).
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastActivityArmRef.current >= ACTIVITY_THROTTLE_MS) {
        lastActivityArmRef.current = now;
        resetTimeout();
      }
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
