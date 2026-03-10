import { api } from './api';

export interface Org {
  id: number;
  name: string;
  owner_id: number;
  created_at: string;
}

export const organizationsService = {
  create: (name: string): Promise<Org> =>
    api.post<Org>('/organizations', { name }),
  getMyOrg: (): Promise<Org> =>
    api.get<Org>('/organizations/me'),
};
