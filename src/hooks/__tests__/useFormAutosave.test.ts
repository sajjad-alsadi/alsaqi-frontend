// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFormAutosave } from '../useFormAutosave';

describe('useFormAutosave', () => {
  // Track what's stored in our mock localStorage
  let store: Record<string, string> = {};

  beforeEach(() => {
    vi.useFakeTimers();
    store = {};

    // Override the global localStorage mock with working implementations
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation(
      (key: string) => store[key] ?? null
    );
    (localStorage.setItem as ReturnType<typeof vi.fn>).mockImplementation(
      (key: string, value: string) => { store[key] = value; }
    );
    (localStorage.removeItem as ReturnType<typeof vi.fn>).mockImplementation(
      (key: string) => { delete store[key]; }
    );
    (localStorage.clear as ReturnType<typeof vi.fn>).mockImplementation(
      () => { store = {}; }
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('حفظ بيانات النموذج تلقائياً في localStorage', () => {
    it('should save form data to localStorage after debounce delay', () => {
      const data = { title: 'خطة تدقيق', department: 'المالية' };

      renderHook(() =>
        useFormAutosave({ key: 'test-form', data, delay: 2000 })
      );

      // Data should not be saved immediately
      expect(store['draft_test-form']).toBeUndefined();

      // Advance past the debounce delay
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      const stored = JSON.parse(store['draft_test-form']);
      expect(stored.data).toEqual(data);
      expect(stored.timestamp).toBeDefined();
    });

    it('should debounce saves when data changes rapidly', () => {
      let data = { title: 'أ' };

      const { rerender } = renderHook(
        ({ formData }) => useFormAutosave({ key: 'debounce-test', data: formData, delay: 1000 }),
        { initialProps: { formData: data } }
      );

      // Change data before debounce fires
      act(() => {
        vi.advanceTimersByTime(500);
      });

      data = { title: 'أب' };
      rerender({ formData: data });

      act(() => {
        vi.advanceTimersByTime(500);
      });

      data = { title: 'أبج' };
      rerender({ formData: data });

      // Only after the full delay from last change should it save
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      const stored = JSON.parse(store['draft_debounce-test']);
      expect(stored.data).toEqual({ title: 'أبج' });
    });

    it('should not save when all values are empty', () => {
      const data = { title: '', department: null as any, notes: undefined as any };

      renderHook(() =>
        useFormAutosave({ key: 'empty-form', data, delay: 500 })
      );

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(store['draft_empty-form']).toBeUndefined();
    });

    it('should not save when enabled is false', () => {
      const data = { title: 'بيانات مهمة' };

      renderHook(() =>
        useFormAutosave({ key: 'disabled-form', data, delay: 500, enabled: false })
      );

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(store['draft_disabled-form']).toBeUndefined();
    });

    it('should use default delay of 2000ms when not specified', () => {
      const data = { title: 'اختبار' };

      renderHook(() =>
        useFormAutosave({ key: 'default-delay', data })
      );

      act(() => {
        vi.advanceTimersByTime(1999);
      });

      expect(store['draft_default-delay']).toBeUndefined();

      act(() => {
        vi.advanceTimersByTime(1);
      });

      expect(store['draft_default-delay']).toBeDefined();
    });

    it('should prefix storage key with "draft_"', () => {
      const data = { title: 'test' };

      renderHook(() =>
        useFormAutosave({ key: 'my-form', data, delay: 100 })
      );

      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(store['draft_my-form']).toBeDefined();
      expect(store['my-form']).toBeUndefined();
    });
  });

  describe('استعادة البيانات عند إعادة التحميل', () => {
    it('should load saved draft from localStorage', () => {
      const savedData = { title: 'مسودة محفوظة', status: 'Draft' };
      store['draft_restore-test'] = JSON.stringify({ data: savedData, timestamp: Date.now() });

      const { result } = renderHook(() =>
        useFormAutosave({ key: 'restore-test', data: { title: '', status: '' }, delay: 2000 })
      );

      const draft = result.current.loadDraft();
      expect(draft).toEqual(savedData);
    });

    it('should return null when no draft exists', () => {
      const { result } = renderHook(() =>
        useFormAutosave({ key: 'no-draft', data: { title: '' }, delay: 2000 })
      );

      const draft = result.current.loadDraft();
      expect(draft).toBeNull();
    });

    it('should return null and remove draft older than 24 hours', () => {
      const oldTimestamp = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      store['draft_expired-test'] = JSON.stringify({ data: { title: 'قديم' }, timestamp: oldTimestamp });

      const { result } = renderHook(() =>
        useFormAutosave({ key: 'expired-test', data: { title: '' }, delay: 2000 })
      );

      const draft = result.current.loadDraft();
      expect(draft).toBeNull();
      expect(store['draft_expired-test']).toBeUndefined();
    });

    it('should return draft that is less than 24 hours old', () => {
      const recentTimestamp = Date.now() - 23 * 60 * 60 * 1000; // 23 hours ago
      const savedData = { title: 'حديث' };
      store['draft_recent-test'] = JSON.stringify({ data: savedData, timestamp: recentTimestamp });

      const { result } = renderHook(() =>
        useFormAutosave({ key: 'recent-test', data: { title: '' }, delay: 2000 })
      );

      const draft = result.current.loadDraft();
      expect(draft).toEqual(savedData);
    });

    it('should return null for invalid JSON in localStorage', () => {
      store['draft_invalid-json'] = 'not-valid-json{{{';

      const { result } = renderHook(() =>
        useFormAutosave({ key: 'invalid-json', data: { title: '' }, delay: 2000 })
      );

      const draft = result.current.loadDraft();
      expect(draft).toBeNull();
    });

    it('hasDraft should return true when a draft exists', () => {
      store['draft_has-draft-test'] = JSON.stringify({ data: { title: 'موجود' }, timestamp: Date.now() });

      const { result } = renderHook(() =>
        useFormAutosave({ key: 'has-draft-test', data: { title: '' }, delay: 2000 })
      );

      expect(result.current.hasDraft()).toBe(true);
    });

    it('hasDraft should return false when no draft exists', () => {
      const { result } = renderHook(() =>
        useFormAutosave({ key: 'no-draft-check', data: { title: '' }, delay: 2000 })
      );

      expect(result.current.hasDraft()).toBe(false);
    });
  });

  describe('مسح البيانات بعد الإرسال الناجح', () => {
    it('should clear draft from localStorage when clearDraft is called', () => {
      store['draft_clear-test'] = JSON.stringify({ data: { title: 'مسودة' }, timestamp: Date.now() });

      const { result } = renderHook(() =>
        useFormAutosave({ key: 'clear-test', data: { title: '' }, delay: 2000 })
      );

      expect(store['draft_clear-test']).toBeDefined();

      act(() => {
        result.current.clearDraft();
      });

      expect(store['draft_clear-test']).toBeUndefined();
    });

    it('should not throw when clearing a non-existent draft', () => {
      const { result } = renderHook(() =>
        useFormAutosave({ key: 'non-existent', data: { title: '' }, delay: 2000 })
      );

      expect(() => {
        result.current.clearDraft();
      }).not.toThrow();
    });

    it('hasDraft should return false after clearDraft', () => {
      store['draft_clear-check'] = JSON.stringify({ data: { title: 'test' }, timestamp: Date.now() });

      const { result } = renderHook(() =>
        useFormAutosave({ key: 'clear-check', data: { title: '' }, delay: 2000 })
      );

      expect(result.current.hasDraft()).toBe(true);

      act(() => {
        result.current.clearDraft();
      });

      expect(result.current.hasDraft()).toBe(false);
    });

    it('loadDraft should return null after clearDraft', () => {
      store['draft_load-after-clear'] = JSON.stringify({ data: { title: 'بيانات' }, timestamp: Date.now() });

      const { result } = renderHook(() =>
        useFormAutosave({ key: 'load-after-clear', data: { title: '' }, delay: 2000 })
      );

      act(() => {
        result.current.clearDraft();
      });

      expect(result.current.loadDraft()).toBeNull();
    });
  });
});
