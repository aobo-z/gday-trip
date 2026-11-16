package com.elec5619.group3.trip_planner_backend;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Comparator;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The database stores timestamps to the microsecond, while LocalDateTime.now() can carry 100-nanosecond
 * precision on Windows. A value read back from the database therefore differs from the in-memory one by
 * less than a microsecond, so tests compare saved timestamps with this tolerance.
 */
public final class TestTimes {

    private static final long TOLERANCE_NANOS = 1_000;

    /** Treats two timestamps less than a microsecond apart as equal. */
    public static final Comparator<LocalDateTime> SAME_MICROSECOND = (a, b) ->
            Math.abs(Duration.between(a, b).toNanos()) < TOLERANCE_NANOS ? 0 : a.compareTo(b);

    private TestTimes() {
    }

    public static void assertSameMicrosecond(LocalDateTime expected, LocalDateTime actual) {
        assertTrue(expected != null && actual != null
                        && SAME_MICROSECOND.compare(expected, actual) == 0,
                () -> "expected: <" + expected + "> but was: <" + actual + ">");
    }
}
