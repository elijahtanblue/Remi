import type { SummaryOutput } from "./domain.js";

// ─── Link Ticket ───

export interface LinkTicketRequest {
  issueKey: string;
  channelId: string;
  threadTs: string;
  slackTeamId: string;
}

export interface LinkTicketResponse {
  linkId: string;
  issueKey: string;
  issueTitle: string;
}

// ─── Brief ───

export interface BriefRequest {
  issueKey: string;
}

export interface BriefResponse {
  summary: SummaryOutput | null;
}

// ─── Pagination ───

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Error ───

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
