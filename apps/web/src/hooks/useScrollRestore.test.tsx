// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, render, act } from '@testing-library/react';
import { useScrollRestore } from './usePersistedFilters';

/**
 * Tests for Requirement 15: scroll-restoration observation must be scoped to the
 * target element, fully cleaned up, and must never accumulate duplicate listeners.
 *
 * - 15.2: observe a defined target element (not document-wide)
 * - 15.3: remove observers and listeners in cleanup (on unmount / detach)
 * - 15.4: do not accumulate duplicate scroll listeners across re-renders
 */

// Records every ResizeObserver constructed so a test can assert which element a
// given instance observed and whether it was later disconnected.
let resizeObservers: FakeResizeObserver[] = [];

class FakeResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(public callback: ResizeObserverCallback) {
    resizeObservers.push(this);
  }
}

// jsdom does not implement layout, so a real element's scrollTop is always 0.
// We make that explicit (getter returns 0, setter is a no-op) so the saved-scroll
// target is never "reached" and the ResizeObserver code path stays active.
function createNode() {
  const node = document.createElement('div');
  Object.defineProperty(node, 'scrollTop', {
    configurable: true,
    get: () => 0,
    set: () => {},
  });
  const addSpy = vi.spyOn(node, 'addEventListener');
  const removeSpy = vi.spyOn(node, 'removeEventListener');
  return { node, addSpy, removeSpy };
}

function scrollAdds(spy: ReturnType<typeof vi.spyOn>): number {
  return spy.mock.calls.filter((c) => c[0] === 'scroll').length;
}

function scrollRemoves(spy: ReturnType<typeof vi.spyOn>): number {
  return spy.mock.calls.filter((c) => c[0] === 'scroll').length;
}

beforeEach(() => {
  resizeObservers = [];
  sessionStorage.clear();
  // Override the global ResizeObserver with our spy-able fake.
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('useScrollRestore — scoped observation and cleanup (Req 15)', () => {
  it('observes the specific target element, not the document (Req 15.2)', () => {
    // A saved scroll target keeps the restore "unsettled" so the observer attaches.
    sessionStorage.setItem('scroll_list', '100');

    const { result } = renderHook(() => useScrollRestore('list'));
    const { node, addSpy } = createNode();

    act(() => {
      result.current(node);
    });

    // Exactly one observer, observing exactly the node we attached to.
    expect(resizeObservers).toHaveLength(1);
    expect(resizeObservers[0].observe).toHaveBeenCalledTimes(1);
    expect(resizeObservers[0].observe).toHaveBeenCalledWith(node);
    // Never document-wide.
    expect(resizeObservers[0].observe).not.toHaveBeenCalledWith(
      document as unknown as Element,
    );
    expect(resizeObservers[0].observe).not.toHaveBeenCalledWith(
      document.body,
    );

    // The scroll listener is bound to the node itself (passive).
    expect(addSpy).toHaveBeenCalledWith('scroll', expect.any(Function), {
      passive: true,
    });
  });

  it('disconnects the prior observer and removes the prior scroll listener when re-attached to a new node (Req 15.3, 15.4)', () => {
    sessionStorage.setItem('scroll_list', '100');

    const { result } = renderHook(() => useScrollRestore('list'));
    const a = createNode();
    const b = createNode();

    act(() => {
      result.current(a.node);
    });

    const handlerA = a.addSpy.mock.calls.find((c) => c[0] === 'scroll')?.[1] as
      | EventListener
      | undefined;
    expect(handlerA).toBeTypeOf('function');

    act(() => {
      result.current(b.node);
    });

    // Prior observer disconnected exactly once.
    expect(resizeObservers[0].disconnect).toHaveBeenCalledTimes(1);
    // Prior scroll listener removed using the same handler reference.
    expect(a.removeSpy).toHaveBeenCalledWith('scroll', handlerA);
    // The new node gets its own, separate observer.
    expect(resizeObservers).toHaveLength(2);
    expect(resizeObservers[1].observe).toHaveBeenCalledWith(b.node);
    // The old node never accumulated a second scroll listener.
    expect(scrollAdds(a.addSpy)).toBe(1);
  });

  it('does not accumulate duplicate scroll listeners or observers across re-attaches to the same node (Req 15.4)', () => {
    sessionStorage.setItem('scroll_list', '100');

    const { result } = renderHook(() => useScrollRestore('list'));
    const { node, addSpy, removeSpy } = createNode();

    // Re-attach the same node twice (simulating re-renders).
    act(() => {
      result.current(node);
    });
    act(() => {
      result.current(node);
    });

    // Each re-attach tears down before re-adding, so net active listeners == 1.
    expect(scrollAdds(addSpy) - scrollRemoves(removeSpy)).toBe(1);
    // The first observer was disconnected before the second was created.
    expect(resizeObservers).toHaveLength(2);
    expect(resizeObservers[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it('removes observers and listeners when detached (ref called with null), as React does on unmount (Req 15.3)', () => {
    sessionStorage.setItem('scroll_list', '100');

    const { result } = renderHook(() => useScrollRestore('list'));
    const { node, addSpy, removeSpy } = createNode();

    act(() => {
      result.current(node);
    });

    const handler = node && addSpy.mock.calls.find((c) => c[0] === 'scroll')?.[1];

    act(() => {
      result.current(null);
    });

    expect(resizeObservers[0].disconnect).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledWith('scroll', handler);
  });

  it('fully cleans up observers and listeners on component unmount (Req 15.3)', () => {
    sessionStorage.setItem('scroll_render', '100');

    // React creates and attaches the real DOM node itself, so we cannot use the
    // createNode() helper here. Pin scrollTop to 0 on the prototype (jsdom has no
    // layout) so the saved target is never "reached" and the observer attaches.
    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      get: () => 0,
      set: () => {},
    });

    // Spy on the prototype so we capture the listener calls made on the real
    // DOM node that React attaches the callback ref to.
    const removeSpy = vi.spyOn(HTMLElement.prototype, 'removeEventListener');

    function ScrollComp({ scrollKey }: { scrollKey: string }) {
      const ref = useScrollRestore(scrollKey);
      return <div ref={ref} data-testid="scroll-region" />;
    }

    try {
      const { unmount } = render(<ScrollComp scrollKey="render" />);

      // An observer was created and scoped to the rendered element.
      expect(resizeObservers).toHaveLength(1);
      expect(resizeObservers[0].observe).toHaveBeenCalledTimes(1);

      unmount();

      // Unmount tears everything down.
      expect(resizeObservers[0].disconnect).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
    } finally {
      // Remove the shadowing accessor so the inherited scrollTop is restored.
      delete (HTMLElement.prototype as { scrollTop?: number }).scrollTop;
    }
  });
});
