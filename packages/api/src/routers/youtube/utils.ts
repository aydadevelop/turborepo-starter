/**
 * Extract the YouTube video ID from a URL.
 * Supports youtube.com, m.youtube.com, youtu.be, and www.youtu.be.
 */
export function extractYoutubeVideoId(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (parsed.hostname === "youtu.be" || parsed.hostname === "www.youtu.be") {
			return parsed.pathname.slice(1) || null;
		}
		if (
			parsed.hostname === "www.youtube.com" ||
			parsed.hostname === "youtube.com" ||
			parsed.hostname === "m.youtube.com"
		) {
			return parsed.searchParams.get("v") || null;
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Fetch basic video metadata via YouTube oEmbed (no API key required).
 */
export async function fetchOEmbedMetadata(
	youtubeVideoId: string
): Promise<{ title: string; channelName: string | null } | null> {
	try {
		const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${youtubeVideoId}`)}&format=json`;
		const res = await fetch(url);
		if (!res.ok) {
			return null;
		}
		const data = (await res.json()) as {
			title?: string;
			author_name?: string;
		};
		return {
			title: data.title ?? youtubeVideoId,
			channelName: data.author_name ?? null,
		};
	} catch {
		return null;
	}
}
