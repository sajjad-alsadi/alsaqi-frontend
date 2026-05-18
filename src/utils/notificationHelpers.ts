export const getTranslatedNotificationMessage = (desc: string, t: any, language: string) => {
  if (!desc) return '';
  
  // Try to parse as JSON translation key (new format from server)
  try {
    const parsed = JSON.parse(desc);
    if (parsed && parsed.key) {
      return t(parsed.key, parsed.params || {});
    }
  } catch {
    // Not JSON - continue with legacy pattern matching (backward compatibility)
  }
  
  // Check for "New record in X"
  const newRecordMatch = desc.match(/^New record in (.*)$/);
  if (newRecordMatch) {
    const table = newRecordMatch[1];
    let moduleKey = table;
    if (table === 'risk_register') moduleKey = 'RiskRegister';
    else if (table === 'audit_plans') moduleKey = 'AuditPlans';
    else if (table === 'audit_tasks') moduleKey = 'AuditTasks';
    else if (table === 'fraud_log') moduleKey = 'FraudLog';
    else if (table === 'audit_programs') moduleKey = 'AuditProgramLibrary';
    else if (table === 'audit_procedures') moduleKey = 'AuditProgramLibrary';
    else if (table === 'audit_evidence') moduleKey = 'AuditTasks';
    else if (table === 'compliance_items' || table === 'central_bank_instructions' || table === 'law_bank' || table === 'internal_policies') moduleKey = 'ComplianceMatrix';
    else if (table === 'audit_reports') moduleKey = 'AuditReports';
    
    const translatedModule = t(`modules.${moduleKey}`, moduleKey);
    return t('notifications.newRecord', { module: translatedModule });
  }
  
  // Other common backend strings
  if (desc === 'New audit finding created') {
    return t('notifications.newAuditFinding');
  }

  if (desc.includes('requested access to Fraud Log')) {
    const user = desc.split(' ')[0];
    return t('notifications.fraudAccessRequested', { user });
  }
  
  if (desc === 'Your access request to Fraud Log has been approved.') {
    return t('notifications.fraudAccessApproved');
  }
  
  if (desc.startsWith('Your access request to Fraud Log was rejected:')) {
    const reason = desc.split(': ')[1] || '';
    return t('notifications.fraudAccessRejected', { reason });
  }

  // Security and Password Reset Alerts
  if (desc.includes('Password reset attempt for non-existent or inactive user:')) {
    const reason = desc.split(': ')[1] || '';
    return t('notifications.passwordResetInvalidUser', { reason });
  }

  if (desc.includes('Password reset request submitted for')) {
    const args = desc.split('for ');
    const userPart = args.length > 1 ? args[1] : '';
    return t('notifications.passwordResetSubmitted', { user: userPart });
  }

  return desc;
};

export const getTranslatedNotificationModule = (module: string, t: any) => {
  if (!module) return module;
  const lower = module.toLowerCase();
  
  let moduleKey: string | null = null;
  if (lower === 'risk-register' || lower === 'risk_register') moduleKey = 'RiskRegister';
  else if (lower === 'audit-plans' || lower === 'audit_plans') moduleKey = 'AuditPlans';
  else if (lower === 'audit-tasks' || lower === 'audit_tasks') moduleKey = 'AuditTasks';
  else if (lower === 'fraud-log' || lower === 'fraud_log') moduleKey = 'FraudLog';
  else if (lower === 'audit-findings') moduleKey = 'AuditReports';
  else if (lower === 'audit-evidence') moduleKey = 'AuditTasks';
  else if (lower === 'compliance' || lower === 'compliance-matrix' || lower === 'central-bank-instructions' || lower === 'law-bank' || lower === 'policies') moduleKey = 'ComplianceMatrix';
  
  if (moduleKey) {
    return t(`modules.${moduleKey}`, moduleKey);
  }
  
  return module;
};