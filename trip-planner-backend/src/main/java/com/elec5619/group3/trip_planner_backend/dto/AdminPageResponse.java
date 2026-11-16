package com.elec5619.group3.trip_planner_backend.dto;

import org.springframework.data.domain.Page;

import java.util.List;

/** FR-22: one page of an admin list. */
public record AdminPageResponse<T>(List<T> items, int page, int totalPages, long totalItems) {

    public static <T> AdminPageResponse<T> of(Page<T> page) {
        return new AdminPageResponse<>(page.getContent(), page.getNumber(), page.getTotalPages(), page.getTotalElements());
    }
}
