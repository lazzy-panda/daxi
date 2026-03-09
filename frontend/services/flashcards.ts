import { api } from './api';

export interface FlashCard {
  id: number | string;
  front: string;
  back: string;
  source?: string;
  source_reference?: string;
  auto_generated?: boolean;
  next_review?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}

export interface CreateFlashCardRequest {
  front: string;
  back: string;
  source?: string;
}

export interface ReviewRequest {
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface StudyStats {
  due_count: number;
  total_count: number;
}

export const flashcardsService = {
  getAll: () => api.get<FlashCard[]>('/flashcards'),

  create: (data: CreateFlashCardRequest) =>
    api.post<FlashCard>('/flashcards', data),

  update: (id: number | string, data: Partial<CreateFlashCardRequest>) =>
    api.put<FlashCard>(`/flashcards/${id}`, data),

  delete: (id: number | string) =>
    api.delete<void>(`/flashcards/${id}`),

  getStudyCards: () => api.get<FlashCard[]>('/flashcards/study'),

  review: (id: number | string, data: ReviewRequest) =>
    api.post<void>(`/flashcards/${id}/review`, data),

  generateAI: (documentId: number | string) =>
    api.post<FlashCard[]>('/flashcards/generate', { document_id: documentId }),

  importJson: (cards: CreateFlashCardRequest[]) =>
    api.post<FlashCard[]>('/flashcards/import/json', { cards }),

  getStats: () => api.get<StudyStats>('/flashcards/stats'),
};
