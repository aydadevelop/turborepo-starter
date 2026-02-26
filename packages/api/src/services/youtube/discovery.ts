import { db } from "@my-app/db";
import {
	ytFeed,
	ytUploaderChannel,
	ytVideo,
} from "@my-app/db/schema/youtube";
import { getChannelVideos, searchChannelVideos } from "@my-app/youtube/channel";
import { getPlaylistVideos } from "@my-app/youtube/playlist";
import { searchYouTube } from "@my-app/youtube/search";
import { and, eq } from "drizzle-orm";
import type {
	QueueProducer,
	YtDiscoveryQueueMessage,
} from "../../contracts/youtube-queue";
import { emitYtNotification } from "./notify";

/** Parse duration to total seconds.
 * Handles ISO 8601 ("PT1H23M45S") and human-readable ("1:23:45", "44:43", "4:43"). */
const ISO_DURATION_RE = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
const WHITESPACE_RE = /\s+/;
function parseDurationSeconds(duration: string): number {
	if (duration.startsWith("P")) {
		const m = ISO_DURATION_RE.exec(duration);
		if (!m) {
			return 0;
		}
		return (
			Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
		);
	}
	// Human-readable: H:MM:SS, MM:SS, M:SS
	const parts = duration.split(":").map(Number);
	if (parts.some(Number.isNaN)) {
		return 0;
	}
	if (parts.length === 3) {
		return (parts[0]! * 3600) + (parts[1]! * 60) + parts[2]!;
	}
	if (parts.length === 2) {
		return (parts[0]! * 60) + parts[1]!;
	}
	return 0;
}

export interface YtDiscoveryDependencies {
	notificationQueue?: QueueProducer;
	ytIngestQueue?: QueueProducer;
}

export type ProcessYtDiscoveryMessageResult =
	| "processed"
	| "skipped_inactive_or_missing";

export interface ProcessYtDiscoveryMessageOptions {
	dependencies: YtDiscoveryDependencies;
	message: YtDiscoveryQueueMessage;
}

interface Candidate {
	channelId: string | null;
	channelName: string | null;
	description: string | null;
	duration: string | null;
	publishedAt: string | null;
	thumbnailUrl: string | null;
	title: string;
	viewCount: number | null;
	youtubeVideoId: string;
}

/**
 * Fetch raw candidates using the feed's source configuration.
 * sourceMode selects exactly one discovery strategy.
 */
async function fetchCandidates(
	feed: {
		name: string;
		sourceMode: "search" | "game_channel" | "user_channel_query" | "playlist";
		playlistId: string | null;
		scopeChannelId: string | null;
		searchQuery: string;
		publishedAfter: string | null;
		lastDiscoveryAt: Date | null;
	},
	searchStopWords: string[] | undefined
): Promise<Candidate[]> {
	switch (feed.sourceMode) {
		case "playlist":
			if (!feed.playlistId) {
				console.warn(
					`[yt-discovery] Feed "${feed.name}" is sourceMode=playlist but has no playlistId`
				);
				return [];
			}
			console.log(
				`[yt-discovery] Fetching playlist ${feed.playlistId} for feed "${feed.name}"`
			);
			try {
				return await getPlaylistVideos({
					playlistId: feed.playlistId,
					maxResults: 50,
				});
			} catch (error) {
				console.warn(
					`[yt-discovery] Playlist ${feed.playlistId} unavailable for feed "${feed.name}": ${error instanceof Error ? error.message : error}`
				);
				return [];
			}
		case "user_channel":
			if (!feed.scopeChannelId) {
				console.warn(
					`[yt-discovery] Feed "${feed.name}" is sourceMode=user_channel but has no scopeChannelId`
				);
				return [];
			}
			const isFirstRunChannel = !feed.lastDiscoveryAt;
			if (isFirstRunChannel) {
				console.log(
					`[yt-discovery] Full crawl (first run) creator channel ${feed.scopeChannelId} for feed "${feed.name}"`
				);
				return getChannelVideos({
					channelId: feed.scopeChannelId,
					tab: "videos",
					maxResults: 1000,
				});
			}
			console.log(
				`[yt-discovery] Incremental crawl creator channel ${feed.scopeChannelId} for feed "${feed.name}"`
			);
			return getChannelVideos({
				channelId: feed.scopeChannelId,
				tab: "recent",
				maxResults: 50,
			});
		case "user_channel_query":
			if (!feed.scopeChannelId || !feed.searchQuery) {
				console.warn(
					`[yt-discovery] Feed "${feed.name}" is sourceMode=user_channel_query but is missing scopeChannelId or searchQuery`
				);
				return [];
			}
			console.log(
				`[yt-discovery] Searching channel ${feed.scopeChannelId} for feed "${feed.name}": ${feed.searchQuery}`
			);
			const searchResults = await searchChannelVideos({
				channelId: feed.scopeChannelId,
				query: feed.searchQuery,
				maxResults: 20,
			});
			if (searchResults.length > 0) {
				return searchResults;
			}
			// Channel has no Search tab — fall back to channel browse with client-side title filter
			console.log(
				`[yt-discovery] Channel search unavailable for "${feed.name}", browsing channel with title filter`
			);
			const browseResults = await getChannelVideos({
				channelId: feed.scopeChannelId,
				tab: feed.lastDiscoveryAt ? "recent" : "videos",
				maxResults: feed.lastDiscoveryAt ? 50 : 200,
			});
			const queryWords = feed.searchQuery
				.toLowerCase()
				.split(WHITESPACE_RE)
				.filter(Boolean);
			return browseResults.filter((v) =>
				queryWords.some((w) => v.title.toLowerCase().includes(w))
			);
		case "game_channel":
			if (!feed.scopeChannelId) {
				console.warn(
					`[yt-discovery] Feed "${feed.name}" is sourceMode=game_channel but has no scopeChannelId`
				);
				return [];
			}
			const isFirstRun = !feed.lastDiscoveryAt;
			if (isFirstRun) {
				console.log(
					`[yt-discovery] Full crawl (first run) channel ${feed.scopeChannelId} for feed "${feed.name}"`
				);
				return getChannelVideos({
					channelId: feed.scopeChannelId,
					tab: "videos",
					maxResults: 1000,
				});
			}
			console.log(
				`[yt-discovery] Incremental crawl channel ${feed.scopeChannelId} for feed "${feed.name}"`
			);
			return getChannelVideos({
				channelId: feed.scopeChannelId,
				tab: "recent",
				maxResults: 50,
			});
		case "search":
		default:
			console.log(
				`[yt-discovery] Searching YouTube for feed "${feed.name}": ${feed.searchQuery}`
			);
			return searchYouTube({
				query: feed.searchQuery,
				maxResults: 100,
				publishedAfter: feed.publishedAfter ?? undefined,
				stopWords: searchStopWords,
			});
	}
}

export const processYtDiscoveryMessage = async ({
	message,
	dependencies,
}: ProcessYtDiscoveryMessageOptions): Promise<ProcessYtDiscoveryMessageResult> => {
	const { feedId, organizationId } = message;

	// 1. Load the feed
	const [feed] = await db
		.select()
		.from(ytFeed)
		.where(
			and(eq(ytFeed.id, feedId), eq(ytFeed.organizationId, organizationId))
		)
		.limit(1);

	if (!feed || feed.status !== "active") {
		return "skipped_inactive_or_missing";
	}

	// 2. Discover candidate videos
	const searchStopWords = feed.stopWords
		?.split(",")
		.map((w) => w.trim().toLowerCase())
		.filter(Boolean);
	const titleStopWords = feed.titleStopWords
		?.split(",")
		.map((w) => w.trim().toLowerCase())
		.filter(Boolean);
	let candidates = await fetchCandidates(feed, searchStopWords);

	// 3. Filter by title exclusions across all source modes
	if (titleStopWords && titleStopWords.length > 0) {
		const before = candidates.length;
		candidates = candidates.filter((candidate) => {
			const title = candidate.title.toLowerCase();
			return !titleStopWords.some((word) => title.includes(word));
		});
		if (candidates.length < before) {
			console.log(
				`[yt-discovery] Feed "${feed.name}": filtered ${before - candidates.length} videos by title stop words`
			);
		}
	}

	// 4. Filter by minimum duration (skip Shorts / trailers)
	const minDuration = feed.minDurationSeconds ?? 0;
	if (minDuration > 0) {
		const before = candidates.length;
		candidates = candidates.filter(
			(c) => !c.duration || parseDurationSeconds(c.duration) >= minDuration
		);
		if (candidates.length < before) {
			console.log(
				`[yt-discovery] Feed "${feed.name}": filtered ${before - candidates.length} short videos (min ${minDuration}s)`
			);
		}
	}

	// 5. Insert new candidate rows (skip already-known videoIds)
	let newCount = 0;
	for (const candidate of candidates) {
		const existing = await db
			.select({ id: ytVideo.id })
			.from(ytVideo)
			.where(
				and(
					eq(ytVideo.feedId, feedId),
					eq(ytVideo.youtubeVideoId, candidate.youtubeVideoId)
				)
			)
			.limit(1);

		if (existing.length > 0) {
			continue;
		}

		// Upsert the uploader channel row (insert if new, update name if changed)
		if (candidate.channelId && candidate.channelName) {
			await db
				.insert(ytUploaderChannel)
				.values({
					id: candidate.channelId,
					name: candidate.channelName,
				})
				.onConflictDoUpdate({
					target: ytUploaderChannel.id,
					set: { name: candidate.channelName },
				});
		}

		await db.insert(ytVideo).values({
			id: crypto.randomUUID(),
			feedId,
			organizationId,
			youtubeVideoId: candidate.youtubeVideoId,
			title: candidate.title,
			uploaderChannelId: candidate.channelId,
			description: candidate.description,
			duration: candidate.duration,
			publishedAt: candidate.publishedAt,
			thumbnailUrl: candidate.thumbnailUrl,
			viewCount: candidate.viewCount,
			status: "candidate",
		});
		newCount++;
	}

	console.log(
		`[yt-discovery] Feed "${feed.name}": ${candidates.length} discovered, ${newCount} new`
	);

	if (newCount > 0) {
		const hourBucket = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
		await emitYtNotification({
			organizationId,
			eventType: "youtube.candidates.discovered",
			idempotencyKey: `yt-discovery:${feedId}:${hourBucket}`,
			title: `${newCount} new video${newCount === 1 ? "" : "s"} found in "${feed.name}"`,
			ctaUrl: `/youtube/videos?feed=${feedId}&status=candidate`,
			severity: "info",
			notificationQueue: dependencies.notificationQueue,
		});
	}

	// 6. Update last discovery time
	await db
		.update(ytFeed)
		.set({ lastDiscoveryAt: new Date() })
		.where(eq(ytFeed.id, feedId));

	return "processed";
};
