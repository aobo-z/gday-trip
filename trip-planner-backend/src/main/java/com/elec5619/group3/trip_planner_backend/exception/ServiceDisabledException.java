package com.elec5619.group3.trip_planner_backend.exception;

/** Thrown when an administrator has switched off the external service a request needs. */
public class ServiceDisabledException extends RuntimeException {
    public ServiceDisabledException(String message) {
        super(message);
    }
}
