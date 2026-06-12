// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, renderHook, act } from '@testing-library/react';
import React, { ReactNode, useEffect, useRef } from 'react';
import { UserProvider, useUser } from '../UserContext';
import type { User } from '../../types';

/**
 * Context Tests - UserContext
 *
 * Covers:
 *  - set-user: the provider exposes and updates the user via setUser
 *  - clear-user: setUser(null) resets the user back to null
 *  - context-value stability: the provided context value identity is stable
 *    across re-renders when the user state is unchanged
 *
 * _Requirements: 10.3_
 */

const sampleUser: User = {
  id: 'user-1',
  username: 'jdoe',
  name: 'John Doe',
  email: 'jdoe@example.com',
  department: 'Internal Audit',
  role: 'Internal Auditor',
  status: 'Active',
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <UserProvider>{children}</UserProvider>
);

describe('UserContext', () => {
  describe('useUser guard', () => {
    it('throws when used outside of a UserProvider', () => {
      expect(() => renderHook(() => useUser())).toThrow(
        'useUser must be used within UserProvider'
      );
    });
  });

  describe('set-user', () => {
    it('exposes a null user by default', () => {
      const { result } = renderHook(() => useUser(), { wrapper });
      expect(result.current.user).toBeNull();
    });

    it('updates the user when setUser is called', () => {
      const { result } = renderHook(() => useUser(), { wrapper });

      act(() => {
        result.current.setUser(sampleUser);
      });

      expect(result.current.user).toEqual(sampleUser);
    });

    it('merges partial changes via updateUser when a user exists', () => {
      const { result } = renderHook(() => useUser(), { wrapper });

      act(() => {
        result.current.setUser(sampleUser);
      });
      act(() => {
        result.current.updateUser({ name: 'Jane Doe', email: 'jane@example.com' });
      });

      expect(result.current.user).toEqual({
        ...sampleUser,
        name: 'Jane Doe',
        email: 'jane@example.com',
      });
    });

    it('does not create a user via updateUser when none is set', () => {
      const { result } = renderHook(() => useUser(), { wrapper });

      act(() => {
        result.current.updateUser({ name: 'Nobody' });
      });

      expect(result.current.user).toBeNull();
    });
  });

  describe('clear-user', () => {
    it('resets the user to null when setUser(null) is called', () => {
      const { result } = renderHook(() => useUser(), { wrapper });

      act(() => {
        result.current.setUser(sampleUser);
      });
      expect(result.current.user).toEqual(sampleUser);

      act(() => {
        result.current.setUser(null);
      });
      expect(result.current.user).toBeNull();
    });
  });

  describe('context-value stability', () => {
    it('keeps the same context value identity across re-renders when state is unchanged', () => {
      const observedValues: ReturnType<typeof useUser>[] = [];

      const Consumer: React.FC<{ tick: number }> = () => {
        const ctx = useUser();
        observedValues.push(ctx);
        return null;
      };

      const { rerender } = render(
        <UserProvider>
          <Consumer tick={0} />
        </UserProvider>
      );

      // Force a parent re-render without changing user state.
      rerender(
        <UserProvider>
          <Consumer tick={1} />
        </UserProvider>
      );

      expect(observedValues.length).toBeGreaterThanOrEqual(2);
      // The memoized value should be referentially identical when state is unchanged.
      expect(observedValues[observedValues.length - 1]).toBe(observedValues[0]);
    });

    it('keeps setUser and updateUser referentially stable across user changes', () => {
      const setUserRefs: Array<(u: User | null) => void> = [];
      const updateUserRefs: Array<(u: Partial<User>) => void> = [];
      let externalSet: (u: User | null) => void = () => {};

      const Consumer: React.FC = () => {
        const { user, setUser, updateUser } = useUser();
        const renderCount = useRef(0);
        renderCount.current += 1;
        setUserRefs.push(setUser);
        updateUserRefs.push(updateUser);
        useEffect(() => {
          externalSet = setUser;
        });
        // reference user so eslint/ts considers it used
        void user;
        return null;
      };

      render(
        <UserProvider>
          <Consumer />
        </UserProvider>
      );

      act(() => {
        externalSet(sampleUser);
      });

      // setUser (from useState) and updateUser (useCallback) are stable identities
      expect(new Set(setUserRefs).size).toBe(1);
      expect(new Set(updateUserRefs).size).toBe(1);
    });

    it('produces a new context value identity when the user changes', () => {
      const observedValues: ReturnType<typeof useUser>[] = [];
      let externalSet: (u: User | null) => void = () => {};

      const Consumer: React.FC = () => {
        const ctx = useUser();
        observedValues.push(ctx);
        externalSet = ctx.setUser;
        return null;
      };

      render(
        <UserProvider>
          <Consumer />
        </UserProvider>
      );

      const before = observedValues[observedValues.length - 1];

      act(() => {
        externalSet(sampleUser);
      });

      const after = observedValues[observedValues.length - 1];
      expect(after).not.toBe(before);
      expect(after.user).toEqual(sampleUser);
    });
  });
});
