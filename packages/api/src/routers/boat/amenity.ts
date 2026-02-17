import { db } from "@full-stack-cf-app/db";
import { boatAmenity } from "@full-stack-cf-app/db/schema/boat";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import z from "zod";
import {
	boatAmenityOutputSchema,
	boatIdInputSchema,
	replaceBoatAmenitiesInputSchema,
} from "../../contracts/boat";
import { organizationPermissionProcedure } from "../../index";
import { requireManagedBoat } from "./access";

export const boatAmenityRouter = {
	list: organizationPermissionProcedure({
		boat: ["read"],
	})
		.route({
			summary: "List boat amenities",
		})
		.input(boatIdInputSchema)
		.output(z.array(boatAmenityOutputSchema))
		.handler(async ({ context, input }) => {
			await requireManagedBoat(
				input.boatId,
				context.activeMembership.organizationId
			);
			return await db
				.select()
				.from(boatAmenity)
				.where(eq(boatAmenity.boatId, input.boatId));
		}),

	replace: organizationPermissionProcedure({
		boat: ["update"],
	})
		.route({
			summary: "Replace boat amenities",
			description: "Atomically replaces all amenities for a boat.",
		})
		.input(replaceBoatAmenitiesInputSchema)
		.output(z.array(boatAmenityOutputSchema))
		.handler(async ({ context, input }) => {
			await requireManagedBoat(
				input.boatId,
				context.activeMembership.organizationId
			);

			const keySet = new Set<string>();
			for (const amenity of input.amenities) {
				if (keySet.has(amenity.key)) {
					throw new ORPCError("BAD_REQUEST", {
						message: `Duplicate amenity key: ${amenity.key}`,
					});
				}
				keySet.add(amenity.key);
			}

			await db.delete(boatAmenity).where(eq(boatAmenity.boatId, input.boatId));

			if (input.amenities.length > 0) {
				await db.insert(boatAmenity).values(
					input.amenities.map((amenity) => ({
						id: crypto.randomUUID(),
						boatId: input.boatId,
						key: amenity.key,
						label: amenity.label,
						isEnabled: amenity.isEnabled,
						value: amenity.value,
						createdAt: new Date(),
						updatedAt: new Date(),
					}))
				);
			}

			return await db
				.select()
				.from(boatAmenity)
				.where(eq(boatAmenity.boatId, input.boatId));
		}),
};
