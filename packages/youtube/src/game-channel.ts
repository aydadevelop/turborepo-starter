/**
 * Extract the game's YouTube channel from a video's watch page.
 *
 * Standalone module — no dependency on proxy infrastructure or ytdlp.
 * Safe to import in any environment (Workers, Node, Bun).
 */

const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface GameChannel {
	/** The game's YouTube channel ID (UC…) */
	channelId: string;
	/** Game title as shown on YouTube (e.g. "Mewgenics") */
	title: string;
}

/**
 * Extract the game's channel from a YouTube video's watch page.
 *
 * YouTube annotates gaming videos with a `videoDescriptionGamingSectionRenderer`
 * in `ytInitialData` that links to the game's official channel page. Returns
 * `null` when the video has no gaming section (non-gaming content, music, etc.).
 */
export async function getGameChannel(
	youtubeVideoId: string,
): Promise<GameChannel | null> {
	const res = await fetch(
		`https://www.youtube.com/watch?v=${encodeURIComponent(youtubeVideoId)}`,
		{
			headers: {
				"User-Agent": USER_AGENT,
				"Accept-Language": "en-US,en;q=0.9",
			},
		},
	);
	if (!res.ok) return null;
	const html = await res.text();
	return extractGameChannelFromHtml(html);
}

/**
 * Pure extraction from already-fetched watch page HTML.
 *
 * YouTube's JSON structure changes over time. This function does a recursive
 * deep search for `videoAttributeViewModel` nodes that link to a YouTube
 * channel with portrait image style (game box art), which is how gaming videos
 * surface the game's dedicated channel in their watch-page metadata.
 */
export function extractGameChannelFromHtml(
	html: string,
): GameChannel | null {
	const data = extractJsonVar(html, "ytInitialData");
	if (!data) return null;
	return findGameChannelInObj(data);
}

function findGameChannelInObj(obj: unknown): GameChannel | null {
	if (typeof obj !== "object" || obj === null) return null;

	if (Array.isArray(obj)) {
		for (const item of obj) {
			const result = findGameChannelInObj(item);
			if (result) return result;
		}
		return null;
	}

	const record = obj as Record<string, unknown>;

	// Structure A (current): videoDescriptionGamingSectionRenderer
	// engagementPanels → structuredDescriptionContentRenderer → items[]
	//   → videoDescriptionGamingSectionRenderer.mediaLockups[0].mediaLockupRenderer
	//       .title.simpleText  (game title)
	//       .endpoint.browseEndpoint.browseId  (UC… channel)
	const gaming = record.videoDescriptionGamingSectionRenderer;
	if (gaming && typeof gaming === "object" && !Array.isArray(gaming)) {
		const gamingR = gaming as Record<string, unknown>;
		const mediaLockups = gamingR.mediaLockups;
		if (Array.isArray(mediaLockups) && mediaLockups.length > 0) {
			for (const lockup of mediaLockups) {
				const mlr = (lockup as Record<string, unknown>)
					.mediaLockupRenderer as Record<string, unknown> | undefined;
				if (!mlr) continue;
				const browseId = (
					(mlr.endpoint as Record<string, unknown> | undefined)
						?.browseEndpoint as Record<string, unknown> | undefined
				)?.browseId;
				const title = (
					mlr.title as Record<string, unknown> | undefined
				)?.simpleText;
				if (typeof browseId === "string" && browseId.startsWith("UC")) {
					return {
						channelId: browseId,
						title: typeof title === "string" ? title : "",
					};
				}
			}
		}
	}

	// Structure B (alternate): videoAttributesSectionViewModel
	// items[] → videoAttributesSectionViewModel.videoAttributeViewModels[]
	//   → title (string), onTap.innertubeCommand.browseEndpoint.browseId (UC…)
	const attrSection = record.videoAttributesSectionViewModel;
	if (attrSection && typeof attrSection === "object" && !Array.isArray(attrSection)) {
		const viewModels = (attrSection as Record<string, unknown>).videoAttributeViewModels;
		if (Array.isArray(viewModels)) {
			for (const vm of viewModels) {
				const vmr = vm as Record<string, unknown>;
				const cmd = (
					vmr.onTap as Record<string, unknown> | undefined
				)?.innertubeCommand as Record<string, unknown> | undefined;
				const browseId = (
					cmd?.browseEndpoint as Record<string, unknown> | undefined
				)?.browseId;
				const tagTitle = vmr.title;
				if (typeof browseId === "string" && browseId.startsWith("UC")) {
					return {
						channelId: browseId,
						title: typeof tagTitle === "string" ? tagTitle : "",
					};
				}
			}
		}
	}

	// Structure C (older): videoAttributeViewModel with portrait image style
	// links to the game's channel via browseEndpoint.
	const vm = record.videoAttributeViewModel;
	if (vm && typeof vm === "object" && !Array.isArray(vm)) {
		const vmr = vm as Record<string, unknown>;
		if (vmr.imageStyle === "VIDEO_ATTRIBUTE_IMAGE_STYLE_PORTRAIT") {
			const cmd = (
				vmr.onTap as Record<string, unknown> | undefined
			)?.innertubeCommand as Record<string, unknown> | undefined;
			const webPageType = (
				(cmd?.commandMetadata as Record<string, unknown> | undefined)
					?.webCommandMetadata as Record<string, unknown> | undefined
			)?.webPageType;
			if (webPageType === "WEB_PAGE_TYPE_CHANNEL") {
				const browseId = (
					cmd?.browseEndpoint as Record<string, unknown> | undefined
				)?.browseId;
				const title = vmr.title;
				if (typeof browseId === "string" && browseId.startsWith("UC")) {
					return {
						channelId: browseId,
						title: typeof title === "string" ? title : "",
					};
				}
			}
		}
	}

	for (const value of Object.values(record)) {
		const result = findGameChannelInObj(value);
		if (result) return result;
	}

	return null;
}

function extractJsonVar(
	html: string,
	varName: string,
): Record<string, unknown> | null {
	const marker = `var ${varName} = `;
	const idx = html.indexOf(marker);
	if (idx === -1) return null;

	const jsonStart = idx + marker.length;
	const candidates = [
		html.indexOf(";</script>", jsonStart),
		html.indexOf(";var ", jsonStart),
		html.indexOf(";window[", jsonStart),
		html.indexOf(";\n", jsonStart),
	].filter((pos) => pos !== -1);

	if (candidates.length === 0) return null;

	try {
		return JSON.parse(html.slice(jsonStart, Math.min(...candidates))) as Record<
			string,
			unknown
		>;
	} catch {
		return null;
	}
}
