package com.elec5619.group3.trip_planner_backend.dto;

import com.elec5619.group3.trip_planner_backend.entity.Announcement;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class AnnouncementRequest {

    @NotBlank(message = "Title is required")
    @Size(max = Announcement.TITLE_MAX, message = "Title must be at most 100 characters")
    private String title;

    @NotBlank(message = "Content is required")
    @Size(max = Announcement.CONTENT_MAX, message = "Content must be at most 5000 characters")
    private String content;

    public void setTitle(String title) {
        this.title = title == null ? null : title.strip();
    }

    public void setContent(String content) {
        this.content = content == null ? null : content.strip();
    }
}
