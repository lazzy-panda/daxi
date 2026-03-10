import { api } from './api';

export interface Plan {
  key: string;
  name: string;
  price_monthly: number;
  max_users: number | null;
  max_docs: number | null;
  features: string[];
}

export interface BillingStatus {
  plan: string;
  plan_name: string;
  max_users: number | null;
  max_docs: number | null;
  usage_users: number;
  usage_docs: number;
  stripe_enabled: boolean;
}

export const billingService = {
  getPlans: () => api.get<Plan[]>('/billing/plans'),
  getStatus: () => api.get<BillingStatus>('/billing/status'),
  createCheckout: (plan: string) =>
    api.post<{ checkout_url: string }>('/billing/checkout', { plan }),
  getPortal: () => api.post<{ portal_url: string }>('/billing/portal'),
};
