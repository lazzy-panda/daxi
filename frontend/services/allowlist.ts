import { api } from './api';

export interface AllowlistEntry {
  id: number | string;
  email: string;
  role: 'curator' | 'examinee';
  created_at?: string;
  used?: boolean;
}

export interface CreateAllowlistEntryRequest {
  email: string;
  role: 'curator' | 'examinee';
}

export const allowlistService = {
  getAll: () => api.get<AllowlistEntry[]>('/allowlist'),

  add: (data: CreateAllowlistEntryRequest) =>
    api.post<AllowlistEntry>('/allowlist', data),

  delete: (id: number | string) =>
    api.delete<void>(`/allowlist/${id}`),
};
