/**
 * What happens to each reference to a person when they export their data or
 * delete their account. Every path that refers to a User must appear here;
 * test/account.test.ts fails otherwise, so a new model can't quietly keep
 * someone's data after they leave.
 *
 * - delete:    the record is theirs alone (private data) and goes with them.
 * - anonymise: others rely on the record (a message in a channel, a note set,
 *              a match result), so it stays, credited to "Deleted user".
 * - pull:      they're removed from a list (members, upvotes, RSVPs).
 * - keep:      an id in someone else's record of an action (who moderated,
 *              who approved). It points at nothing once the account is gone.
 *
 * Paths: `field` for a field or an array of ids, `list.field` for a field inside
 * an array of sub-documents, `map.$*` for a map of id arrays.
 */
export type AccountAction = 'delete' | 'anonymise' | 'pull' | 'keep';

export interface AccountRule {
  path: string;
  action: AccountAction;
}

const r = (path: string, action: AccountAction): AccountRule => ({ path, action });

export const ACCOUNT_RULES: Record<string, AccountRule[]> = {
  // Private, theirs alone.
  Application: [r('user', 'delete')],
  AttendanceMark: [r('user', 'delete')],
  CheckIn: [r('user', 'delete')],
  ClassSlot: [r('user', 'delete')],
  ClubApplication: [r('user', 'delete'), r('reviewedBy', 'keep')],
  Contact: [r('owner', 'delete')],
  Course: [r('user', 'delete')],
  CreditTransaction: [r('user', 'delete')],
  Expense: [r('user', 'delete')],
  ExternalAccount: [r('user', 'delete')],
  GameRating: [r('user', 'delete')],
  GdQueueEntry: [r('user', 'delete')],
  HubBan: [r('user', 'delete'), r('by', 'keep')],
  HubJoinRequest: [r('user', 'delete')],
  HubMember: [r('user', 'delete')],
  HubReadState: [r('user', 'delete')],
  LedgerEntry: [r('user', 'delete')],
  Listing: [r('seller', 'delete'), r('interested', 'pull')],
  LostItem: [r('reporter', 'delete')],
  MessRating: [r('user', 'delete')],
  MoneyProfile: [r('user', 'delete')],
  Notification: [r('user', 'delete'), r('actor', 'anonymise')],
  PushDevice: [r('user', 'delete')],
  QuizAttempt: [r('user', 'delete')],
  ReferralRequest: [r('requester', 'delete'), r('alum', 'anonymise')],
  Resume: [r('user', 'delete')],
  Task: [r('user', 'delete')],
  VerificationToken: [r('user', 'delete')],

  // Shared with others: stays, credited to nobody.
  Bounty: [r('owner', 'anonymise'), r('slotsFilled', 'pull')],
  CaseComp: [r('addedBy', 'anonymise'), r('savedBy', 'pull')],
  Club: [r('members.user', 'pull'), r('budget.entries.by', 'anonymise'), r('tasks.assignee', 'anonymise'), r('tasks.createdBy', 'anonymise')],
  CompanyPage: [r('revisions.editor', 'anonymise')],
  Event: [r('host', 'anonymise'), r('rsvps.user', 'pull')],
  GameMatch: [r('players.user', 'anonymise')],
  GameRoom: [r('host', 'anonymise'), r('seats.user', 'anonymise'), r('spectators', 'pull'), r('reports.user', 'anonymise')],
  GdSession: [r('moderator', 'anonymise'), r('participants', 'pull'), r('feedback.user', 'pull')],
  HubConversation: [r('participants', 'pull'), r('createdBy', 'anonymise')],
  HubInvite: [r('createdBy', 'anonymise')],
  HubMessage: [r('author', 'anonymise'), r('mentions.users', 'pull'), r('reactions.users', 'pull'), r('hiddenBy', 'keep')],
  HubServer: [r('owner', 'anonymise')],
  InterviewQuestion: [r('contributor', 'anonymise'), r('upvotes', 'pull'), r('hiddenBy', 'keep')],
  InterviewSlot: [r('mentor', 'anonymise'), r('bookedBy', 'anonymise'), r('cancelledBy', 'keep'), r('rescheduleHistory.by', 'keep')],
  Job: [r('author', 'anonymise'), r('hiddenBy', 'keep')],
  Message: [r('sender', 'anonymise'), r('receiver', 'anonymise')],
  Post: [r('author', 'anonymise'), r('comments.author', 'anonymise'), r('reactions.$*', 'pull'), r('hiddenBy', 'keep')],
  Report: [r('reporter', 'anonymise'), r('resolvedBy', 'keep')],
  Resource: [r('author', 'anonymise'), r('upvotes', 'pull'), r('hiddenBy', 'keep')],
  SessionTemplate: [r('author', 'anonymise'), r('upvotes', 'pull')],
  Team: [r('captain', 'anonymise'), r('members.user', 'pull'), r('requests.user', 'pull')],
  Whisper: [r('author', 'anonymise'), r('hiddenBy', 'keep')],

  // Records of what someone did to something else: results and moderation history.
  AuditLog: [r('actor', 'keep')],
  Campus: [r('requestedBy', 'keep'), r('approvedBy', 'keep')],
  GameRelease: [r('publishedBy', 'keep')],
  MessMenu: [r('updatedBy', 'keep')],
  Tournament: [r('createdBy', 'anonymise'), r('entrants', 'keep'), r('matches.players', 'keep'), r('matches.winner', 'keep'), r('standings.user', 'keep'), r('winner', 'keep')],
};

/** Collections that are never included in an export, with why. */
export const NOT_EXPORTED: Record<string, string> = {
  ExternalAccount: 'OAuth tokens for connected calendars and meeting apps; the export lists the providers instead.',
  VerificationToken: 'One-time sign-in and reset codes.',
};
