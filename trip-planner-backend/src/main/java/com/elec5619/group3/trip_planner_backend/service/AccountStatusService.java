package com.elec5619.group3.trip_planner_backend.service;

import com.elec5619.group3.trip_planner_backend.repository.UserRepository;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * FR-22: ids of disabled accounts, kept in memory so the JWT filter can refuse
 * their tokens without a database query on every request.
 * Like the service settings cache, this is per backend instance.
 */
@Service
public class AccountStatusService {

    private final UserRepository userRepository;
    private final Set<Long> disabledUserIds = ConcurrentHashMap.newKeySet();

    public AccountStatusService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @PostConstruct
    void load() {
        disabledUserIds.addAll(userRepository.findDisabledUserIds());
    }

    public boolean isDisabled(Long userId) {
        return userId != null && disabledUserIds.contains(userId);
    }

    /** Call only after the user's new state has been saved. */
    void remember(Long userId, boolean disabled) {
        if (disabled) {
            disabledUserIds.add(userId);
        } else {
            disabledUserIds.remove(userId);
        }
    }
}
