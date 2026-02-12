-- Guard invalid booking intervals.
CREATE TRIGGER IF NOT EXISTS booking_validate_interval_insert
BEFORE INSERT ON `booking`
WHEN NEW.`starts_at` >= NEW.`ends_at`
BEGIN
	SELECT RAISE(ABORT, 'BOOKING_INVALID_RANGE');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS booking_validate_interval_update
BEFORE UPDATE ON `booking`
WHEN NEW.`starts_at` >= NEW.`ends_at`
BEGIN
	SELECT RAISE(ABORT, 'BOOKING_INVALID_RANGE');
END;
--> statement-breakpoint

-- Enforce no overlap for blocking booking statuses.
CREATE TRIGGER IF NOT EXISTS booking_prevent_overlap_insert
BEFORE INSERT ON `booking`
WHEN NEW.`status` IN ('pending', 'awaiting_payment', 'confirmed', 'in_progress')
BEGIN
	SELECT RAISE(ABORT, 'BOOKING_OVERLAP')
	WHERE EXISTS (
		SELECT 1
		FROM `booking` existing
		WHERE existing.`boat_id` = NEW.`boat_id`
			AND existing.`organization_id` = NEW.`organization_id`
			AND existing.`status` IN ('pending', 'awaiting_payment', 'confirmed', 'in_progress')
			AND existing.`starts_at` < NEW.`ends_at`
			AND existing.`ends_at` > NEW.`starts_at`
	);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS booking_prevent_overlap_update
BEFORE UPDATE ON `booking`
WHEN NEW.`status` IN ('pending', 'awaiting_payment', 'confirmed', 'in_progress')
BEGIN
	SELECT RAISE(ABORT, 'BOOKING_OVERLAP')
	WHERE EXISTS (
		SELECT 1
		FROM `booking` existing
		WHERE existing.`id` <> NEW.`id`
			AND existing.`boat_id` = NEW.`boat_id`
			AND existing.`organization_id` = NEW.`organization_id`
			AND existing.`status` IN ('pending', 'awaiting_payment', 'confirmed', 'in_progress')
			AND existing.`starts_at` < NEW.`ends_at`
			AND existing.`ends_at` > NEW.`starts_at`
	);
END;

