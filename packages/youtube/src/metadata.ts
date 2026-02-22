import { YtDlp } from "ytdlp-nodejs";

export interface VideoMetadata {
	channelId: string | null;
	channelName: string | null;
	description: string | null;
	duration: string | null;
	publishedAt: string | null;
	tags: string[];
	thumbnailUrl: string | null;
	title: string;
	viewCount: number | null;
	youtubeVideoId: string;
}

let ytdlpInstance: YtDlp | null = null;

function getYtDlp(): YtDlp {
	if (!ytdlpInstance) {
		ytdlpInstance = new YtDlp();
	}
	return ytdlpInstance;
}

/**
 * Fetch metadata for a single YouTube video.
 */
export async function getVideoMetadata(
	youtubeVideoId: string
): Promise<VideoMetadata> {
	const ytdlp = getYtDlp();
	const url = `https://www.youtube.com/watch?v=${youtubeVideoId}`;

	const info = await ytdlp.getInfoAsync(url);
	const entry = info as unknown as Record<string, unknown>;

	const tags = entry.tags as string[] | undefined;

	return {
		youtubeVideoId: String(entry.id ?? youtubeVideoId),
		title: String(entry.title ?? ""),
		channelName: resolveChannel(entry),
		channelId: entry.channel_id ? String(entry.channel_id) : null,
		description: entry.description ? String(entry.description) : null,
		duration: entry.duration_string ? String(entry.duration_string) : null,
		publishedAt: entry.upload_date
			? formatUploadDate(String(entry.upload_date))
			: null,
		thumbnailUrl: entry.thumbnail ? String(entry.thumbnail) : null,
		tags: tags ?? [],
		viewCount: entry.view_count ? Number(entry.view_count) : null,
	};
}

function resolveChannel(entry: Record<string, unknown>): string | null {
	if (entry.channel) {
		return String(entry.channel);
	}
	return entry.uploader ? String(entry.uploader) : null;
}

function formatUploadDate(yyyymmdd: string): string {
	if (yyyymmdd.length !== 8) {
		return yyyymmdd;
	}
	return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}
