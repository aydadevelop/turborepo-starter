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
