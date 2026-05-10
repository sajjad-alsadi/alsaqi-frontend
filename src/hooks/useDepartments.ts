import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

export interface Department {
  id: string;
  name: string;       // name_ar — always populated
  name_ar: string;
  name_en: string | null;
  entity_code: string;
  entity_type: string;
  parent_id: string | null;
  manager_name: string | null;
  level: number;
  status: string;
  display_order: number;
  description?: string;
  location?: string;
  cost_center_code?: string;
  children?: Department[];
}

export function useDepartments() {
  const queryClient = useQueryClient();

  const deptQuery = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const r = await api.get('/departments');
      return Array.isArray(r.data) ? r.data : [];
    },
    staleTime: 30 * 60 * 1000, // 30 minutes cache for static-ish data
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['departments'] });
  };

  return { 
    departments: (deptQuery.data || []) as Department[], 
    loading: deptQuery.isLoading || deptQuery.isFetching, 
    error: deptQuery.error ? (deptQuery.error as any).message : null, 
    refresh 
  };
}
