import { useState, useEffect, useCallback } from 'react';
import { riskService } from '../services/riskService';

export const useRisks = (initialParams: any = {}) => {
  const [risks, setRisks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRisks = useCallback(async (params: any = {}) => {
    setLoading(true);
    setError(null);
    try {
      const data = await riskService.getRisks(params);
      const riskData = data.data || (Array.isArray(data) ? data : []);
      setRisks(riskData);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch risks');
      setRisks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRisks(initialParams);
  }, [fetchRisks, JSON.stringify(initialParams)]);

  return { risks, loading, error, fetchRisks };
};
