import { api } from './api';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface User {
  id: number | string;
  email: string;
  name?: string;
  role: 'curator' | 'examinee';
}

export interface MeResponse {
  id: number | string;
  email: string;
  name?: string;
  role: 'curator' | 'examinee';
}

export const authService = {
  login: (data: LoginRequest) =>
    api.post<AuthResponse>('/auth/login', data),

  register: (data: RegisterRequest) =>
    api.post<AuthResponse>('/auth/register', data),

  me: () => api.get<MeResponse>('/auth/me'),
};
