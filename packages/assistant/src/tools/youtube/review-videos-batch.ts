import z from "zod";
import type { AppRouterClient } from "@my-app/api/routers";
import { orpcMutationTool } from "../../lib/orpc-tool";

const schema = z.object({
	videos: z
		.array(
			z.object({
				/** Internal video ID (the `id` field from ytListVideos, NOT the YouTube video ID) */
				videoId: z.string().trim().min(1),
				action: z.enum(["approve", "reject"]),
				/** Required when action=reject */
				rejectionReason: z.string().trim().max(500).optional(),
			})
		)
		.min(1)
		.max(50),
});

export const createReviewVideosBatchTool = (client: AppRouterClient) =>
	orpcMutationTool(
		schema,
		[
			"Approve or reject multiple candidate videos in one call.",
			"Use this instead of ytReviewVideo when reviewing several videos at once.",
			"",
			"Each entry needs:",
			"  - videoId: the internal `id` from ytListVideos (not the YouTube video ID)",
			"  - action: 'approve' or 'reject'",
			"  - rejectionReason: required when action='reject'",
			"",
			"Approved videos are immediately queued for transcript extraction and NLP analysis.",
			"You do NOT need to investigate videos before approving — approve by title/channel if the topic is clear.",
		].join("\n"),
		async ({ videos }) => {
			const results = await Promise.all(
				videos.map(async (v) => {
					try {
						const result = await client.youtube.videos.review({
							videoId: v.videoId,
							action: v.action,
							rejectionReason: v.rejectionReason,
						});
						return { videoId: v.videoId, action: v.action, status: result.status, ok: true };
					} catch (e) {
						return {
							videoId: v.videoId,
							action: v.action,
							ok: false,
							error: e instanceof Error ? e.message : String(e),
						};
					}
				})
			);

			const approved = results.filter((r) => r.ok && r.action === "approve").length;
			const rejected = results.filter((r) => r.ok && r.action === "reject").length;
			const failed = results.filter((r) => !r.ok).length;

			return { approved, rejected, failed, results };
		},
	);
