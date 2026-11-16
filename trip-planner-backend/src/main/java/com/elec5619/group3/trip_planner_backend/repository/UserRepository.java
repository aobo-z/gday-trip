package com.elec5619.group3.trip_planner_backend.repository;

import com.elec5619.group3.trip_planner_backend.entity.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    // FR-22: admin user list, matching on username or email.
    @Query("select u from User u where lower(u.username) like lower(concat('%', :query, '%'))"
            + " or lower(u.email) like lower(concat('%', :query, '%'))")
    Page<User> search(@Param("query") String query, Pageable page);

    @Query("select u.userId from User u where u.disabled = true")
    List<Long> findDisabledUserIds();
}
