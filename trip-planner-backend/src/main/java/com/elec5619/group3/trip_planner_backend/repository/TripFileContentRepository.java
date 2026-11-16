package com.elec5619.group3.trip_planner_backend.repository;

import com.elec5619.group3.trip_planner_backend.entity.TripFileContent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TripFileContentRepository extends JpaRepository<TripFileContent, Long> {
}
