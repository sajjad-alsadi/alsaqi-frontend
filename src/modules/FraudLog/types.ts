export interface FraudCase {
  id: string;
  detectionDate: string;
  source: string;
  riskCategory: 'Financial' | 'Operational' | 'Compliance' | 'Reputational';
  condition: string;
  suspects: string;
  financialImpact: string;
  status: 'Open' | 'Under Investigation' | 'Closed - Convicted' | 'Closed - Insufficient Evidence';
  correctiveActions: string;
}

export type AccessStatus = 'None' | 'Pending' | 'Approved' | 'Rejected';

export interface AccessRequest {
  id: number;
  user_id: number;
  user_name: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  rejection_reason?: string;
  request_date: string;
}
