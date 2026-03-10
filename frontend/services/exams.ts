import { api } from './api';

export interface MCQChoice {
  label: string;
  text: string;
}

export interface ExamQuestion {
  id: number | string;
  text: string;
  question_type?: 'open' | 'mcq';
  choices?: MCQChoice[];
  order?: number;
}

export interface ExamSession {
  id: number | string;
  questions: ExamQuestion[];
  started_at: string;
  status: 'in_progress' | 'completed';
}

export interface ExamAnswer {
  question_id: number | string;
  answer_text: string;
}

export interface QuestionResult {
  question_id: number | string;
  question_text: string;
  answer_text: string;
  score: number;
  max_score: number;
  is_correct: boolean;
  feedback?: string;
  explanation?: string;
  suggestions?: string;
  resources?: string[];
}

export interface ExamResult {
  id: number | string;
  total_score: number;
  max_score: number;
  percentage: number;
  passed: boolean;
  completed_at: string;
  question_results: QuestionResult[];
}

export interface ExamHistory {
  id: number | string;
  completed_at: string;
  total_score: number;
  max_score: number;
  percentage: number;
  passed: boolean;
}

export interface EligibilityResponse {
  eligible: boolean;
  days_until_next_attempt?: number;
  message?: string;
}

// submit returns the session; we only need id for the redirect
export interface SubmitResponse {
  id: number | string;
}

export const examsService = {
  start: () => api.post<ExamSession>('/exams/start'),

  submit: (examId: number | string, answers: ExamAnswer[]) =>
    api.post<SubmitResponse>(`/exams/${examId}/submit`, { answers }),

  getResult: (resultId: number | string) =>
    api.get<ExamResult>(`/exams/results/${resultId}`),

  getMyHistory: () => api.get<ExamHistory[]>('/exams/history'),

  getAllResults: () => api.get<ExamResult[]>('/results'),

  checkEligibility: () => api.get<EligibilityResponse>('/exams/eligibility'),
};
