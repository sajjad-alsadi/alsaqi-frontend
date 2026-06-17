// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  QUERY_STALE_TIMES,
  FRESHNESS_TIERS,
  getStaleTimeForQuery,
} from './queryDefaults';

describe('queryDefaults', () => {
  describe('QUERY_STALE_TIMES', () => {
    it('defines referenceData as 5 minutes', () => {
      expect(QUERY_STALE_TIMES.referenceData).toBe(5 * 60 * 1000);
    });

    it('defines volatileData as 1 minute', () => {
      expect(QUERY_STALE_TIMES.volatileData).toBe(1 * 60 * 1000);
    });

    it('defines rarelyChanging as 30 minutes', () => {
      expect(QUERY_STALE_TIMES.rarelyChanging).toBe(30 * 60 * 1000);
    });
  });

  describe('FRESHNESS_TIERS', () => {
    it('has three tiers defined', () => {
      expect(FRESHNESS_TIERS).toHaveLength(3);
    });

    it('referenceData tier includes expected query key prefixes', () => {
      const tier = FRESHNESS_TIERS.find(t => t.category === 'referenceData');
      expect(tier).toBeDefined();
      expect(tier!.queryKeyPrefixes).toContain('departments');
      expect(tier!.queryKeyPrefixes).toContain('job-titles');
      expect(tier!.queryKeyPrefixes).toContain('org-structure');
      expect(tier!.queryKeyPrefixes).toContain('compliance-matrix');
      expect(tier!.staleTime).toBe(5 * 60_000);
      expect(tier!.gcTime).toBe(30 * 60_000);
    });

    it('volatileData tier includes expected query key prefixes', () => {
      const tier = FRESHNESS_TIERS.find(t => t.category === 'volatileData');
      expect(tier).toBeDefined();
      expect(tier!.queryKeyPrefixes).toContain('notifications');
      expect(tier!.queryKeyPrefixes).toContain('audit-trail');
      expect(tier!.queryKeyPrefixes).toContain('unread-count');
      expect(tier!.staleTime).toBe(1 * 60_000);
      expect(tier!.gcTime).toBe(5 * 60_000);
    });

    it('rarelyChanging tier includes expected query key prefixes', () => {
      const tier = FRESHNESS_TIERS.find(t => t.category === 'rarelyChanging');
      expect(tier).toBeDefined();
      expect(tier!.queryKeyPrefixes).toContain('settings');
      expect(tier!.queryKeyPrefixes).toContain('user-profile');
      expect(tier!.queryKeyPrefixes).toContain('feature-flags');
      expect(tier!.staleTime).toBe(30 * 60_000);
      expect(tier!.gcTime).toBe(60 * 60_000);
    });
  });

  describe('getStaleTimeForQuery', () => {
    it('returns volatile staleTime for notifications queries', () => {
      expect(getStaleTimeForQuery(['notifications', 'list'])).toBe(QUERY_STALE_TIMES.volatileData);
    });

    it('returns volatile staleTime for audit-trail queries', () => {
      expect(getStaleTimeForQuery(['audit-trail', 'recent'])).toBe(QUERY_STALE_TIMES.volatileData);
    });

    it('returns volatile staleTime for unread-count queries', () => {
      expect(getStaleTimeForQuery(['unread-count'])).toBe(QUERY_STALE_TIMES.volatileData);
    });

    it('returns rarelyChanging staleTime for settings queries', () => {
      expect(getStaleTimeForQuery(['settings', 'theme'])).toBe(QUERY_STALE_TIMES.rarelyChanging);
    });

    it('returns rarelyChanging staleTime for user-profile queries', () => {
      expect(getStaleTimeForQuery(['user-profile', 'me'])).toBe(QUERY_STALE_TIMES.rarelyChanging);
    });

    it('returns rarelyChanging staleTime for feature-flags queries', () => {
      expect(getStaleTimeForQuery(['feature-flags'])).toBe(QUERY_STALE_TIMES.rarelyChanging);
    });

    it('returns referenceData staleTime for departments queries', () => {
      expect(getStaleTimeForQuery(['departments', 'all'])).toBe(QUERY_STALE_TIMES.referenceData);
    });

    it('returns referenceData staleTime for job-titles queries', () => {
      expect(getStaleTimeForQuery(['job-titles'])).toBe(QUERY_STALE_TIMES.referenceData);
    });

    it('returns referenceData staleTime for org-structure queries', () => {
      expect(getStaleTimeForQuery(['org-structure', 'tree'])).toBe(QUERY_STALE_TIMES.referenceData);
    });

    it('returns referenceData staleTime for compliance-matrix queries', () => {
      expect(getStaleTimeForQuery(['compliance-matrix'])).toBe(QUERY_STALE_TIMES.referenceData);
    });

    it('falls back to referenceData staleTime for unknown query keys', () => {
      expect(getStaleTimeForQuery(['unknown-key', 'data'])).toBe(QUERY_STALE_TIMES.referenceData);
    });

    it('falls back to referenceData staleTime for empty query key array', () => {
      expect(getStaleTimeForQuery([])).toBe(QUERY_STALE_TIMES.referenceData);
    });
  });
});
