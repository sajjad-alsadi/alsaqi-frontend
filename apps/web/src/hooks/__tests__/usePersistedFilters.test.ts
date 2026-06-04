// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistedFilters } from '../usePersistedFilters';

describe('usePersistedFilters', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  describe('حفظ الفلاتر في sessionStorage واستعادتها', () => {
    it('should return the default value when no stored value exists', () => {
      const { result } = renderHook(() => usePersistedFilters('test-key', 'default'));

      expect(result.current[0]).toBe('default');
    });

    it('should persist a string value to sessionStorage', () => {
      const { result } = renderHook(() => usePersistedFilters('search', ''));

      act(() => {
        result.current[1]('hello');
      });

      expect(result.current[0]).toBe('hello');
      expect(sessionStorage.getItem('filters_search')).toBe(JSON.stringify('hello'));
    });

    it('should persist an object value to sessionStorage', () => {
      const defaultFilters = { status: '', dept: '' };
      const { result } = renderHook(() => usePersistedFilters('filters', defaultFilters));

      act(() => {
        result.current[1]({ status: 'active', dept: 'IT' });
      });

      expect(result.current[0]).toEqual({ status: 'active', dept: 'IT' });
      expect(sessionStorage.getItem('filters_filters')).toBe(
        JSON.stringify({ status: 'active', dept: 'IT' })
      );
    });

    it('should restore a previously stored value on mount', () => {
      sessionStorage.setItem('filters_saved', JSON.stringify('restored-value'));

      const { result } = renderHook(() => usePersistedFilters('saved', 'default'));

      expect(result.current[0]).toBe('restored-value');
    });

    it('should restore a previously stored object on mount', () => {
      const storedFilters = { status: 'completed', dept: 'Finance' };
      sessionStorage.setItem('filters_obj', JSON.stringify(storedFilters));

      const { result } = renderHook(() => usePersistedFilters('obj', { status: '', dept: '' }));

      expect(result.current[0]).toEqual(storedFilters);
    });

    it('should fall back to default value when stored value is invalid JSON', () => {
      sessionStorage.setItem('filters_bad', 'not-valid-json{{{');

      const { result } = renderHook(() => usePersistedFilters('bad', 'fallback'));

      expect(result.current[0]).toBe('fallback');
    });

    it('should support functional updates', () => {
      const { result } = renderHook(() => usePersistedFilters('counter', 0));

      act(() => {
        result.current[1]((prev) => prev + 1);
      });

      expect(result.current[0]).toBe(1);

      act(() => {
        result.current[1]((prev) => prev + 5);
      });

      expect(result.current[0]).toBe(6);
    });

    it('should use the key prefix "filters_" for storage', () => {
      const { result } = renderHook(() => usePersistedFilters('my-page', 'test'));

      act(() => {
        result.current[1]('updated');
      });

      expect(sessionStorage.getItem('filters_my-page')).toBe(JSON.stringify('updated'));
      expect(sessionStorage.getItem('my-page')).toBeNull();
    });

    it('should handle array values correctly', () => {
      const { result } = renderHook(() => usePersistedFilters('tags', [] as string[]));

      act(() => {
        result.current[1](['tag1', 'tag2']);
      });

      expect(result.current[0]).toEqual(['tag1', 'tag2']);
      expect(sessionStorage.getItem('filters_tags')).toBe(JSON.stringify(['tag1', 'tag2']));
    });

    it('should keep separate storage for different keys', () => {
      const { result: result1 } = renderHook(() => usePersistedFilters('key1', 'a'));
      const { result: result2 } = renderHook(() => usePersistedFilters('key2', 'b'));

      act(() => {
        result1.current[1]('updated-a');
      });

      expect(result1.current[0]).toBe('updated-a');
      expect(result2.current[0]).toBe('b');
    });

    it('should handle null values', () => {
      const { result } = renderHook(() => usePersistedFilters<string | null>('nullable', null));

      expect(result.current[0]).toBeNull();

      act(() => {
        result.current[1]('not-null');
      });

      expect(result.current[0]).toBe('not-null');

      act(() => {
        result.current[1](null);
      });

      expect(result.current[0]).toBeNull();
    });
  });
});
