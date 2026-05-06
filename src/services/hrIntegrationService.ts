// src/services/hrIntegrationService.ts

export interface Employee {
  id: string;
  name: string;
  email: string;
  department: string;
  jobTitle: string;
}

export const fetchEmployeesFromHR = async (): Promise<Employee[]> => {
  // هنا سيتم وضع منطق الاتصال بـ API نظام الموارد البشرية
  // محاكاة للبيانات
  return [
    { id: 'EMP001', name: 'أحمد محمد', email: 'ahmed@company.com', department: 'المالية', jobTitle: 'محاسب' },
    { id: 'EMP002', name: 'سارة علي', email: 'sara@company.com', department: 'الموارد البشرية', jobTitle: 'مدير موارد بشرية' },
  ];
};
