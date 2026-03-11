import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "@my-app/db";
import { listingAsset } from "@my-app/db/schema/marketplace";
import { getStorageProvider } from "@my-app/storage";

export const assetRoutes = new Hono();

assetRoutes.get("/:providerId/*", async (c) => {
	const providerId = c.req.param("providerId");
	const key = c.req.param("*");

	if (!providerId || !key) {
		return c.json({ error: "Not Found" }, 404);
	}

	const [asset] = await db
		.select({
			storageKey: listingAsset.storageKey,
			mimeType: listingAsset.mimeType,
			access: listingAsset.access,
		})
		.from(listingAsset)
		.where(
			and(
				eq(listingAsset.storageProvider, providerId),
				eq(listingAsset.storageKey, key),
				eq(listingAsset.access, "public"),
			),
		)
		.limit(1);

	if (!asset) {
		return c.json({ error: "Not Found" }, 404);
	}

	let provider;
	try {
		provider = getStorageProvider(providerId);
	} catch {
		return c.json({ error: "Not Found" }, 404);
	}

	if (provider.getObjectBuffer) {
		const body = await provider.getObjectBuffer({
			key: asset.storageKey,
			access: asset.access,
		});

		return new Response(body, {
			headers: {
				"content-type": asset.mimeType ?? "application/octet-stream",
				"cache-control": "public, max-age=3600",
			},
		});
	}

	const publicUrl = provider.getPublicUrl({
		key: asset.storageKey,
		access: asset.access,
	});
	if (!publicUrl) {
		return c.json({ error: "Not Found" }, 404);
	}

	return c.redirect(publicUrl, 302);
});
