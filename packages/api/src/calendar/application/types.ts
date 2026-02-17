import type { CalendarProvider } from "@full-stack-cf-app/db/schema/boat";

import type { CalendarWatchChannel } from "../adapters/types";

// ─── Discriminated union outcomes ───────────────────────────────────

export type IngestWebhookOutcome =
	| {
			kind: "adapter_not_configured";
	  }
	| {
			kind: "missing_headers";
	  }
	| {
			kind: "unauthorized";
	  }
	| {
			kind: "duplicate";
			webhookEventId: string;
			matched: boolean;
			previousStatus: string | null;
	  }
	| {
			kind: "accepted";
			webhookEventId: string;
			matched: boolean;
			connectionId?: string;
			provider?: CalendarProvider;
			processedEvents?: number;
			nextSyncToken?: string | null;
			recoveredFromExpiredToken?: boolean;
	  };

export type SyncProviderOutcome =
	| {
			kind: "ok";
			provider: CalendarProvider;
			totalConnections: number;
			results: Array<SyncConnectionResult | SyncConnectionError>;
	  }
	| {
			kind: "error";
			message: string;
	  };

export type WatchStartOutcome =
	| {
			kind: "ok";
			connectionId: string;
			provider: CalendarProvider;
			watch: CalendarWatchChannel;
	  }
	| {
			kind: "error";
			message: string;
	  };

export type WatchStopOutcome =
	| {
			kind: "ok";
			connectionId: string;
			provider: CalendarProvider;
			stopped: boolean;
	  }
	| {
			kind: "error";
			message: string;
	  };

export type WatchRenewOutcome =
	| {
			kind: "ok";
			provider: CalendarProvider;
			renewBeforeSeconds: number;
			totalCandidates: number;
			renewedCount: number;
			results: RenewResult[];
	  }
	| {
			kind: "error";
			message: string;
	  };

export type DeadLetterListOutcome =
	| {
			kind: "ok";
			total: number;
			items: unknown[];
	  }
	| {
			kind: "error";
			message: string;
	  };

export type InitialSyncOutcome =
	| {
			kind: "ok";
			connectionId: string;
			provider: CalendarProvider;
			processedEvents: number;
			nextSyncToken: string | null;
	  }
	| {
			kind: "skipped";
			connectionId: string;
	  }
	| {
			kind: "error";
			connectionId: string;
			message: string;
	  };

export type ResyncOutcome =
	| {
			kind: "ok";
			connectionId: string;
			provider: CalendarProvider;
			processedEvents: number;
			nextSyncToken: string | null;
			recoveredFromExpiredToken: boolean;
	  }
	| {
			kind: "skipped";
			connectionId: string;
	  }
	| {
			kind: "error";
			connectionId: string;
			message: string;
	  };

export type RetryFailedSyncsOutcome =
	| {
			kind: "ok";
			provider: CalendarProvider;
			totalErrorConnections: number;
			eligibleCount: number;
			retriedCount: number;
			maxedOutCount: number;
			results: RetryResult[];
	  }
	| {
			kind: "error";
			message: string;
	  };

export interface RetryResult {
	connectionId: string;
	provider: CalendarProvider;
	retried: boolean;
	processedEvents?: number;
	error?: string;
	retryCount?: number;
}

// ─── Shared sub-types ──────────────────────────────────────────────

export interface SyncConnectionResult {
	connectionId: string;
	provider: CalendarProvider;
	processedEvents: number;
	nextSyncToken: string | null;
	recoveredFromExpiredToken: boolean;
}

export interface SyncConnectionError {
	connectionId: string;
	provider: CalendarProvider;
	error: string;
}

export interface RenewResult {
	connectionId: string;
	provider: CalendarProvider;
	renewed: boolean;
	watch?: CalendarWatchChannel;
	error?: string;
}
