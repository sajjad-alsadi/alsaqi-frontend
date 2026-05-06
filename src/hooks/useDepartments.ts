import { useState, useEffect } from 'react';
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

let _cache: Department[] | null = null;
let _promise: Promise<Department[]> | null = null;

export function useDepartments() {
  const [departments, setDepartments] = useState<Department[]>(_cache ?? []);
  const [loading, setLoading] = useState(!_cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (_cache) { 
      setDepartments(_cache); 
      setLoading(false); 
      return; 
    }

    if (!_promise) {
      _promise = api.get('/departments')
        .then(r => {
          _cache = Array.isArray(r.data) ? r.data : [];
          return _cache;
        })
        .catch(err => {
          const msg = err.response?.data?.error?.message || err.message || 'Failed to fetch departments';
          setError(msg);
          _cache = [];
          return _cache;
        })
        .finally(() => { 
          _promise = null; 
        });
    }

    _promise.then(data => {
      setDepartments(data);
      setLoading(false);
    }).catch(e => {
      const msg = e.response?.data?.error?.message || e.message;
      setError(msg);
      setLoading(false);
    });
  }, []);

  const refresh = async () => {
    _cache = null;
    _promise = null;
    setLoading(true);
    try {
      const r = await api.get('/departments');
      _cache = Array.isArray(r.data) ? r.data : [];
      setDepartments(_cache);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return { departments, loading, error, refresh };
}
