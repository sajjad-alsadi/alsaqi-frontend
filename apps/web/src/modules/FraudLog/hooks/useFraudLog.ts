import { useState, useEffect } from 'react';
import api from '../../../api/httpClient';
import { useAuth } from '../../../context/AuthContext';
import { useAppContext } from '../../../context/AppContext';
import { FraudCase, AccessRequest, AccessStatus } from '../types';

export const useFraudLog = (isManager: boolean) => {
  const { token } = useAuth();
  const { fetchNotifications } = useAppContext();
  const [cases, setCases] = useState<FraudCase[]>([]);
  const [policyContent, setPolicyContent] = useState('');
  
  // Access Control State
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [accessStatus, setAccessStatus] = useState<AccessStatus>('None');
  const [myRequest, setMyRequest] = useState<AccessRequest | null>(null);
  
  // Modals & UI State
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestReason, setRequestReason] = useState('');
  const [requestError, setRequestError] = useState<string | null>(null);

  const hasAccess = isManager || accessStatus === 'Approved';

  useEffect(() => {
    if (token) {
      fetchMyStatus();
      fetchPolicy();
      if (isManager) fetchRequests();
    }
  }, [token, isManager]);

  useEffect(() => {
    if (hasAccess && token) {
      fetchCases();
    }
  }, [hasAccess, token]);

  const fetchCases = async () => {
    try {
      const res = await api.get('/fraud-log');
      setCases(res.data.data || (Array.isArray(res.data) ? res.data : []));
    } catch (err) {
      console.error('Failed to load fraud cases', err);
      setCases([]);
    }
  };

  const fetchPolicy = async () => {
    if (!token) return;
    try {
      const res = await api.get('/policies/fraud_policy');
      setPolicyContent(res.data.content);
    } catch (err) {
      console.error("Error fetching policy:", err);
    }
  };

  const savePolicy = async (content: string) => {
    if (!token) return;
    try {
      await api.put('/policies/fraud_policy', { content });
      setPolicyContent(content);
      return true;
    } catch (err) {
      console.error("Error saving policy:", err);
      return false;
    }
  };

  const fetchMyStatus = async () => {
    try {
      const res = await api.get('/fraud-access-requests/my-status');
      setAccessStatus(res.data.status);
      if (res.data.id) setMyRequest(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchRequests = async () => {
    try {
      const res = await api.get('/fraud-access-requests');
      setRequests(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const submitAccessRequest = async () => {
    setRequestError(null);
    try {
      await api.post('/fraud-access-requests', { reason: requestReason });
      setIsRequestModalOpen(false);
      setRequestReason('');
      fetchMyStatus();
      if (isManager) fetchRequests();
      return true;
    } catch (err: any) {
      console.error(err);
      setRequestError(err.response?.data?.error || 'Failed to request access');
      return false;
    }
  };

  const approveRequest = async (id: string, duration: string) => {
    try {
      await api.put(`/fraud-access-requests/${id}/approve`, { duration });
      fetchRequests();
      fetchNotifications();
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  const rejectRequest = async (id: string, reason: string) => {
    try {
      await api.put(`/fraud-access-requests/${id}/reject`, { reason });
      fetchRequests();
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  const addCase = async (newCase: Partial<FraudCase>) => {
    try {
      await api.post('/fraud-log', newCase);
      fetchCases();
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  return {
    cases,
    policyContent,
    requests,
    accessStatus,
    myRequest,
    hasAccess,
    isRequestModalOpen,
    setIsRequestModalOpen,
    requestReason,
    setRequestReason,
    requestError,
    submitAccessRequest,
    approveRequest,
    rejectRequest,
    addCase,
    savePolicy
  };
};
