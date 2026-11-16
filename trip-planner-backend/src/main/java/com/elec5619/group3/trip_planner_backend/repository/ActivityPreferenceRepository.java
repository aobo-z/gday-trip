package com.elec5619.group3.trip_planner_backend.repository;

import com.elec5619.group3.trip_planner_backend.entity.ActivityPreference;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface ActivityPreferenceRepository extends JpaRepository<ActivityPreference, Long> {
    Optional<ActivityPreference> findByActivity_IdAndUser_UserIdAndPreferredDate(
            Long activityId, Long userId, LocalDate preferredDate);
    List<ActivityPreference> findByActivity_IdOrderByPreferredDateAscIdAsc(Long activityId);
}
