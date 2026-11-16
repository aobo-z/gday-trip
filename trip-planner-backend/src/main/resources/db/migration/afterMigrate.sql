-- Flyway runs this callback on every startup, unlike versioned migrations which run once.
-- trips.test_trip was removed from the code, but an older build re-adds it through
-- ddl-auto=update, so it is dropped whenever it shows up again.
SET @drop_test_trip = (
    SELECT IF(COUNT(*) > 0, 'ALTER TABLE trips DROP COLUMN test_trip', 'DO 0')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trips' AND COLUMN_NAME = 'test_trip'
);
PREPARE drop_test_trip FROM @drop_test_trip;
EXECUTE drop_test_trip;
DEALLOCATE PREPARE drop_test_trip;
