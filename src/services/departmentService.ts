import api from './api';

const API_URL = '/departments';

export const getDepartments = async () => {
  const response = await api.get(API_URL);
  return Array.isArray(response.data) ? response.data : (response.data.data || []);
};

export const addDepartment = async (name: string) => {
  const response = await api.post(API_URL, { name });
  return response.data;
};

export const deleteDepartment = async (id: string) => {
  await api.delete(`${API_URL}/${id}`);
};
