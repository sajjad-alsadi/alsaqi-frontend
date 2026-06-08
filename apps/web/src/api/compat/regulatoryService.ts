import api from '../httpClient';
import { CentralBankInstruction } from '../../types';

const API_URL = '/central-bank-instructions';

export const getInstructions = async (): Promise<CentralBankInstruction[]> => {
  const response = await api.get(API_URL);
  return response.data.data || (Array.isArray(response.data) ? response.data : []);
};

export const addInstruction = async (instruction: Omit<CentralBankInstruction, 'id'>) => {
  const response = await api.post(API_URL, instruction);
  return response.data;
};

export const updateInstruction = async (id: string, instruction: Partial<CentralBankInstruction>) => {
  await api.put(`${API_URL}/${id}`, instruction);
};

export const deleteInstruction = async (id: string) => {
  await api.delete(`${API_URL}/${id}`);
};
