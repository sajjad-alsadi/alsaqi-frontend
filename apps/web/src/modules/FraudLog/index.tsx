import React, { useState } from 'react';
import { Lock, Plus, FileText } from 'lucide-react';
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

  const [editingPolicy, setEditingPolicy] = useState(currentPolicy);

  // No access — show the access gate (which includes its own header)
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
        fetchPolicy={async () => {}}
      />
    );
  }

  // Has access — show the fraud log content
  return (
    <div className="space-y-5">
      {/* Action bar — no redundant page header, parent tab establishes context */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-[var(--color-danger)]">
          <Lock size={13} />
          <span className="uppercase tracking-wider">{t('integrity.confidentialAccess')}</span>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline"
            size="sm"
            onClick={() => setIsPolicyOpen(true)}
            className="flex items-center gap-2"
          >
            <FileText size={15} />
            {t('integrity.viewPolicy')}
          </Button>
          {isManager && (
            <Button 
              variant="destructive"
              size="sm"
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2"
            >
              <Plus size={16} />
              {t('integrity.reportCase')}
            </Button>
          )}
        </div>
      </div>

      {/* Pending access requests — only show for managers when there are pending items */}
      {isManager && requests.filter(r => r.status === 'Pending').length > 0 && (
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
      )}

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
