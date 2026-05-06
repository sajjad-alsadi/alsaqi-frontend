import { useState, useEffect, useCallback } from 'react';
import { auditService } from '../services/auditService';

export const useAuditPlans = (initialParams: any = {}) => {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 15,
    totalPages: 0
  });

  const fetchPlans = useCallback(async (params: any = {}) => {
    setLoading(true);
    setError(null);
    try {
      const data = await auditService.getPlans(params);
      if (data.data) {
        setPlans(data.data);
        setPagination(prev => ({
          ...prev,
          total: data.pagination.total,
          totalPages: data.pagination.totalPages,
          page: data.pagination.page,
          limit: data.pagination.pageSize
        }));
      } else {
        setPlans(Array.isArray(data) ? data : []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch audit plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans(initialParams);
  }, [fetchPlans, JSON.stringify(initialParams)]);

  return { plans, loading, error, pagination, fetchPlans };
};
