import React, { useState } from 'react';
import { ShieldAlert, Lock, Plus, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUser } from '../../context/UserContext';
import { UserRole } from '../../constants';
import { Button } from '@/components/ui/button';

// Refactored Assets
import { useFraudLog } from './hooks/useFraudLog';
import { AccessGate } from './components/AccessGate';
import { FraudTable } from './components/FraudTable';
import { AddCaseModal } from './components/AddCaseModal';

const FraudLog: React.FC = () => {
  const { user } = useUser();
  const { t } = useTranslation();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);
  const [policyContent, setPolicyContent] = useState('');

  const isManager = user?.role === UserRole.ADMIN || user?.role === UserRole.MANAGER;
  
  const {
    cases,
    policyContent: currentPolicy,
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
  } = useFraudLog(isManager);

  // Sync internal state for editing if needed
  const [editingPolicy, setEditingPolicy] = useState(currentPolicy);

  if (!hasAccess) {
    return (
      <AccessGate 
        isManager={isManager}
        accessStatus={accessStatus}
        myRequest={myRequest}
        requests={requests}
        isRequestModalOpen={isRequestModalOpen}
        setIsRequestModalOpen={setIsRequestModalOpen}
        requestReason={requestReason}
        setRequestReason={setRequestReason}
        requestError={requestError}
        submitAccessRequest={submitAccessRequest}
        approveRequest={approveRequest}
        rejectRequest={rejectRequest}
        policyContent={editingPolicy || currentPolicy}
        setPolicyContent={setEditingPolicy}
        savePolicy={savePolicy}
        fetchPolicy={async () => {}} // Hook handles re-fetch on success inside savePolicy mostly or via effects
      />
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-[var(--color-danger)] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[var(--color-danger)]/20">
            <ShieldAlert size={32} />
          </div>
          <div>
            <h2 className="text-2xl sm:text-4xl font-bold text-[var(--color-text-main)] tracking-tight">{t('integrity.fraud')}</h2>
            <p className="text-sm text-[var(--color-danger)] font-semibold uppercase tracking-[0.2em] mt-2 flex items-center gap-2">
              <Lock size={14} />
              {t('integrity.confidentialAccess')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button 
            variant="outline"
            onClick={() => setIsPolicyOpen(true)}
            className="flex items-center gap-2"
          >
            <FileText size={18} />
            {t('integrity.viewPolicy')}
          </Button>
          {isManager && (
            <Button 
              variant="destructive"
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2"
            >
              <Plus size={20} />
              {t('integrity.reportCase')}
            </Button>
          )}
        </div>
      </div>

      <AccessGate 
        isManager={isManager}
        accessStatus={accessStatus}
        myRequest={myRequest}
        requests={requests}
        isRequestModalOpen={isRequestModalOpen}
        setIsRequestModalOpen={setIsRequestModalOpen}
        requestReason={requestReason}
        setRequestReason={setRequestReason}
        requestError={requestError}
        submitAccessRequest={submitAccessRequest}
        approveRequest={approveRequest}
        rejectRequest={rejectRequest}
        policyContent={editingPolicy || currentPolicy}
        setPolicyContent={setEditingPolicy}
        savePolicy={savePolicy}
        fetchPolicy={async () => {}}
      />

      <FraudTable cases={cases} />

      <AddCaseModal 
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={addCase}
      />
    </div>
  );
};

export default FraudLog;
