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

export interface ChatResponse {
  answer: string;
  sources: string[];
}

export const documentsService = {
  getAll: () => api.get<Document[]>('/documents'),

  getAvailable: () => api.get<Document[]>('/documents/available'),

  upload: (formData: FormData) =>
    api.postForm<Document>('/documents/upload', formData),

  delete: (id: number | string) =>
    api.delete<void>(`/documents/${id}`),

  chat: (id: number | string, question: string) =>
    api.post<ChatResponse>(`/documents/${id}/chat`, { question }),
};
