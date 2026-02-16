-- Validate that starts_at < ends_at
CREATE TRIGGER booking_validate_range_insert
BEFORE INSERT ON booking
BEGIN
  SELECT CASE
    WHEN NEW.starts_at >= NEW.ends_at
    THEN RAISE(ABORT, 'BOOKING_INVALID_RANGE: starts_at must be before ends_at')
  END;
END;--> statement-breakpoint

CREATE TRIGGER booking_validate_range_update
BEFORE UPDATE ON booking
WHEN NEW.starts_at >= NEW.ends_at
BEGIN
  SELECT RAISE(ABORT, 'BOOKING_INVALID_RANGE: starts_at must be before ends_at');
END;--> statement-breakpoint

-- Prevent overlapping bookings on the same boat for blocking statuses
CREATE TRIGGER booking_no_overlap_insert
BEFORE INSERT ON booking
WHEN NEW.status NOT IN ('cancelled', 'no_show')
BEGIN
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM booking
      WHERE boat_id = NEW.boat_id
        AND id != NEW.id
        AND status NOT IN ('cancelled', 'no_show')
        AND starts_at < NEW.ends_at
        AND ends_at > NEW.starts_at
    )
    THEN RAISE(ABORT, 'BOOKING_OVERLAP: overlapping booking exists for this boat')
  END;
END;--> statement-breakpoint

CREATE TRIGGER booking_no_overlap_update
BEFORE UPDATE ON booking
WHEN NEW.status NOT IN ('cancelled', 'no_show')
BEGIN
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM booking
      WHERE boat_id = NEW.boat_id
        AND id != NEW.id
        AND status NOT IN ('cancelled', 'no_show')
        AND starts_at < NEW.ends_at
        AND ends_at > NEW.starts_at
    )
    THEN RAISE(ABORT, 'BOOKING_OVERLAP: overlapping booking exists for this boat')
  END;
END;
