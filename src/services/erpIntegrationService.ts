// src/services/erpIntegrationService.ts

export interface FinancialTransaction {
  id: string;
  amount: number;
  date: string;
  description: string;
  accountCode: string;
}

export const fetchTransactionsFromERP = async (): Promise<FinancialTransaction[]> => {
  // هنا سيتم وضع منطق الاتصال بـ API نظام الـ ERP
  // محاكاة للبيانات
  return [
    { id: 'TXN001', amount: 5000, date: '2026-03-01', description: 'شراء أجهزة مكتبية', accountCode: 'ACC-101' },
    { id: 'TXN002', amount: 12000, date: '2026-03-05', description: 'مصاريف تسويق', accountCode: 'ACC-202' },
  ];
};
