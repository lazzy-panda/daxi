import { api } from './api';

export interface Question {
  id: number | string;
  text: string;
  created_at?: string;
  source?: string;
  auto_generated?: boolean;
}

export interface CreateQuestionRequest {
  text: string;
  source?: string;
}

export const questionsService = {
  getAll: () => api.get<Question[]>('/questions'),

  create: (data: CreateQuestionRequest) =>
    api.post<Question>('/questions', data),

  update: (id: number | string, data: Partial<CreateQuestionRequest>) =>
    api.put<Question>(`/questions/${id}`, data),

  delete: (id: number | string) =>
    api.delete<void>(`/questions/${id}`),

  generateAI: (documentId: number | string, count = 5) =>
    api.post<Question[]>('/questions/generate', {
      document_id: documentId,
      count,
    }),

  importJson: (questions: CreateQuestionRequest[]) =>
    api.post<Question[]>('/questions/import/json', { questions }),
};
