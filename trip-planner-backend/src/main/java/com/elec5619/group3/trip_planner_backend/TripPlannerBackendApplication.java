package com.elec5619.group3.trip_planner_backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.util.TimeZone;

@SpringBootApplication
public class TripPlannerBackendApplication {

	// Timestamps are stored as LocalDateTime (no zone), and servers often run on UTC.
	// Pinning the zone keeps recorded times and "today" in Sydney time on every machine.
	static final String APP_TIME_ZONE = "Australia/Sydney";

	public static void main(String[] args) {
		TimeZone.setDefault(TimeZone.getTimeZone(APP_TIME_ZONE));
		SpringApplication.run(TripPlannerBackendApplication.class, args);
	}

}
