import { useState, useEffect, useCallback } from 'react';
import { auditService } from '../services/auditService';

export const useAuditFindings = (initialParams: any = {}) => {
  const [findings, setFindings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFindings = useCallback(async (params: any = {}) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await auditService.getFindings(params);
      const data = resp.data || resp;
      setFindings(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch audit findings');
      setFindings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFindings(initialParams);
  }, [fetchFindings, JSON.stringify(initialParams)]);

  return { findings, loading, error, fetchFindings };
};
