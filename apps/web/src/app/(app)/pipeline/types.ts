import type {
  ApplicationStage,
  ApplicationSource,
  RoleTrack,
  RoundType,
  RoundOutcome,
} from '@/lib/constants';

/** Wire shapes for the pipeline module, shared by the board and its dialogs. */

export interface Round {
  _id: string;
  type: RoundType;
  label: string;
  scheduledAt: string | null;
  outcome: RoundOutcome;
  notes: string;
  intelPromptedAt: string | null;
  questionsLogged: number;
  completedAt: string | null;
}

export interface Application {
  _id: string;
  company: string;
  companyKey: string;
  role: string;
  track: RoleTrack;
  source: ApplicationSource;
  stage: ApplicationStage;
  rounds: Round[];
  appliedAt?: string;
  closedAt?: string;
  notes: string;
  /** How many questions this campus has logged for the company. */
  intelAvailable: number;
  updatedAt: string;
}

export interface PipelineResponse {
  applications: Application[];
  summary: { open: number; offers: number; closed: number; upcomingRounds: number };
}

/** Which round a student should be looking at: the soonest one still pending. */
export function nextRound(application: Application): Round | null {
  const pending = application.rounds
    .filter((round) => round.outcome === 'pending')
    .sort((a, b) => {
      // Scheduled rounds first, in date order; undated ones trail behind.
      if (a.scheduledAt && b.scheduledAt) {
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      }
      if (a.scheduledAt) return -1;
      if (b.scheduledAt) return 1;
      return 0;
    });

  return pending[0] ?? null;
}
