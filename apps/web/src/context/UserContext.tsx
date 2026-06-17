import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { User } from '../types';

/** Value context — holds user profile data. */
interface UserValueType {
  user: User | null;
}

/** Actions context — holds functions that mutate user state. */
interface UserActionsType {
  setUser: (user: User | null) => void;
  updateUser: (userData: Partial<User>) => void;
}

/** Legacy combined type for backward compatibility. */
interface UserContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  updateUser: (userData: Partial<User>) => void;
}

const UserValueContext = createContext<UserValueType | undefined>(undefined);
const UserActionsContext = createContext<UserActionsType | undefined>(undefined);
const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  const updateUser = useCallback((userData: Partial<User>) => {
    setUser(prev => {
      if (!prev) return prev;
      return { ...prev, ...userData };
    });
  }, []);

  const valueState = useMemo<UserValueType>(() => ({ user }), [user]);

  const actions = useMemo<UserActionsType>(() => ({
    setUser, updateUser
  }), [updateUser]);

  const combined = useMemo<UserContextType>(() => ({
    user, setUser, updateUser
  }), [user, updateUser]);

  return (
    <UserContext.Provider value={combined}>
      <UserValueContext.Provider value={valueState}>
        <UserActionsContext.Provider value={actions}>
          {children}
        </UserActionsContext.Provider>
      </UserValueContext.Provider>
    </UserContext.Provider>
  );
};

/** Read-only user state (user profile). Does not re-render on action reference changes. */
export const useUserValue = (): UserValueType => {
  const context = useContext(UserValueContext);
  if (!context) throw new Error('useUserValue must be used within UserProvider');
  return context;
};

/** User actions (setUser, updateUser). Does not re-render on user data changes. */
export const useUserActions = (): UserActionsType => {
  const context = useContext(UserActionsContext);
  if (!context) throw new Error('useUserActions must be used within UserProvider');
  return context;
};

/** Legacy hook — returns combined value + actions. Use useUserValue/useUserActions for selective subscriptions. */
export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) throw new Error('useUser must be used within UserProvider');
  return context;
};
