import { api } from './api';

export interface Notification {
  id: number | string;
  title?: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
  related_id?: number | string;
}

export const notificationsService = {
  getAll: () => api.get<Notification[]>('/notifications'),

  markRead: (id: number | string) =>
    api.patch<Notification>(`/notifications/${id}/read`),

  markAllRead: () => api.post<void>('/notifications/read-all'),

  delete: (id: number | string) =>
    api.delete<void>(`/notifications/${id}`),

  getUnreadCount: () => api.get<{ count: number }>('/notifications/unread-count'),
};
