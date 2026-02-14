import { o } from "../../index";
import { mergeRouterFragments } from "../shared/router-merge";
import { boatAmenityRouter } from "./amenity";
import { boatAssetRouter } from "./asset";
import { boatAvailabilityRouter } from "./availability";
import { boatCalendarRouter } from "./calendar";
import { boatDockRouter } from "./dock";
import { boatMinDurationRouter } from "./min-duration";
import { boatPricingRouter } from "./pricing";
import { boatSelfRouter } from "./self";

export const boatRouter = mergeRouterFragments(
	o.tag("Boats").router(boatSelfRouter),
	{
		dock: o.tag("Docks").router(boatDockRouter),
		amenity: o.tag("Amenities").router(boatAmenityRouter),
		asset: o.tag("Assets").router(boatAssetRouter),
		calendar: o.tag("Calendar").router(boatCalendarRouter),
		availability: o.tag("Availability").router(boatAvailabilityRouter),
		pricing: o.tag("Pricing").router(boatPricingRouter),
		minDuration: o.tag("Min Duration").router(boatMinDurationRouter),
	}
);
