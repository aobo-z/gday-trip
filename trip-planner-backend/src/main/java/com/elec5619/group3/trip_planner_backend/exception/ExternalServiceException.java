package com.elec5619.group3.trip_planner_backend.exception;

/** An external API (Gemini, Google Places) failed or answered with something unusable; reported as 502. */
public class ExternalServiceException extends RuntimeException {
    public ExternalServiceException(String message) {
        super(message);
    }
}
