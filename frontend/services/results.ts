import { api } from './api';
import type { ExamResult } from './exams';

export const resultsService = {
  getAll: () => api.get<ExamResult[]>('/results'),

  getById: (id: number | string) =>
    api.get<ExamResult>(`/results/${id}`),
};
