import { api } from './api';

export interface Document {
  id: number | string;
  name: string;
  filename: string;
  status: 'processing' | 'ready' | 'failed';
  size?: number;
  created_at: string;
  mime_type?: string;
}

export const documentsService = {
  getAll: () => api.get<Document[]>('/documents'),

  upload: (formData: FormData) =>
    api.postForm<Document>('/documents/upload', formData),

  delete: (id: number | string) =>
    api.delete<void>(`/documents/${id}`),
};
