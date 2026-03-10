import { api } from './api';

export interface AnalyticsOverview {
  total_examinees: number;
  total_attempts: number;
  pass_rate: number;
  avg_score: number;
  attempts_this_week: number;
  attempts_this_month: number;
}

export interface QuestionStat {
  question_id: number;
  question_text: string;
  question_type: string;
  total_answers: number;
  correct_count: number;
  fail_rate: number;
}

export interface ExamineeStat {
  user_id: number;
  email: string;
  attempts: number;
  best_score: number;
  last_attempt_at: string | null;
  ever_passed: boolean;
}

export const analyticsService = {
  getOverview: () => api.get<AnalyticsOverview>('/analytics/overview'),
  getQuestions: () => api.get<QuestionStat[]>('/analytics/questions'),
  getExaminees: () => api.get<ExamineeStat[]>('/analytics/examinees'),
};
