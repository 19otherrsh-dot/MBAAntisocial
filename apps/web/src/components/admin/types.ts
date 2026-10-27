import type { UserRole } from '@mba/shared/constants';
import type { SuccessMetrics } from '@/server/modules/admin/metrics';

export type { SuccessMetrics };

export interface Person {
  _id: string;
  name: string;
  email: string;
  image: string | null;
  campus: string;
  batch: string;
  year: number;
  role: UserRole;
  suspended: boolean;
  verified: boolean;
  joinedAt: string;
  lastActiveAt: string | null;
}

export interface AuditEntry {
  _id: string;
  actor: { name?: string; email?: string } | null;
  campus: string;
  action: string;
  targetType: string;
  targetLabel: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  reason: string;
  createdAt: string;
}
