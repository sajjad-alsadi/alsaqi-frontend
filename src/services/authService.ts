import api from './api';

export const loginUser = async (usernameOrEmail: string, password: string, rememberMe?: boolean) => {
  try {
    const response = await api.post('/auth/login', { usernameOrEmail, password, rememberMe });
    return response.data;
  } catch (error: any) {
    const errorData = error.response?.data?.error;
    const errorMessage = typeof errorData === 'object' ? errorData.message : (errorData || 'Login failed');
    throw new Error(errorMessage);
  }
};

export const logoutUser = async () => {
  try {
    await api.post('/auth/logout');
  } catch (error) {
    console.error('Logout error:', error);
  }
};

export const getCurrentUser = async () => {
  try {
    const response = await api.get('/auth/me');
    return response.data.user;
  } catch (error) {
    return null;
  }
};
