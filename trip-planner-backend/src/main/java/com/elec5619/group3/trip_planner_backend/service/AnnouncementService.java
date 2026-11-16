package com.elec5619.group3.trip_planner_backend.service;

import com.elec5619.group3.trip_planner_backend.dto.AnnouncementRequest;
import com.elec5619.group3.trip_planner_backend.dto.AnnouncementResponse;
import com.elec5619.group3.trip_planner_backend.entity.Announcement;
import com.elec5619.group3.trip_planner_backend.entity.TripMember;
import com.elec5619.group3.trip_planner_backend.exception.ResourceNotFoundException;
import com.elec5619.group3.trip_planner_backend.repository.AnnouncementRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * FR-19: Trip announcements.
 * Trip members can read them; trip owners can publish, edit and remove them.
 * Any owner of the trip can manage any of its announcements, since a trip can
 * have several owners.
 */
@Service
public class AnnouncementService {

    private final AnnouncementRepository announcementRepository;
    private final TripMemberService tripMemberService;

    public AnnouncementService(
            AnnouncementRepository announcementRepository,
            TripMemberService tripMemberService) {

        this.announcementRepository = announcementRepository;
        this.tripMemberService = tripMemberService;
    }

    /**
     * FR-19: Announcements for a trip, newest first.
     * Allowed: Any active trip member.
     */
    @Transactional(readOnly = true)
    public List<AnnouncementResponse> getAnnouncements(
            Long tripId,
            Long currentUserId) {

        TripMember viewer = tripMemberService.verifyUserIsMember(tripId, currentUserId);
        boolean canManage = "OWNER".equals(viewer.getRole());

        return announcementRepository
                .findByTrip_TripIdOrderByPublishedAtDescAnnouncementIdDesc(tripId)
                .stream()
                .map(announcement -> mapToResponse(announcement, canManage))
                .toList();
    }

    /**
     * FR-19: Publish an announcement.
     * Allowed: Trip owners only.
     */
    @Transactional
    public AnnouncementResponse createAnnouncement(
            Long tripId,
            AnnouncementRequest request,
            Long currentUserId) {

        TripMember owner = tripMemberService.verifyUserIsOwner(tripId, currentUserId);

        Announcement announcement = new Announcement();
        announcement.setTrip(owner.getTrip());
        announcement.setAuthor(owner.getUser());
        announcement.setTitle(request.getTitle());
        announcement.setContent(request.getContent());

        return mapToResponse(announcementRepository.save(announcement), true);
    }

    /**
     * FR-19: Edit an announcement's title and content.
     * The publication time is kept; the update time records the edit.
     * Allowed: Trip owners only.
     */
    @Transactional
    public AnnouncementResponse updateAnnouncement(
            Long tripId,
            Long announcementId,
            AnnouncementRequest request,
            Long currentUserId) {

        tripMemberService.verifyUserIsOwner(tripId, currentUserId);

        Announcement announcement = findInTrip(tripId, announcementId);
        announcement.setTitle(request.getTitle());
        announcement.setContent(request.getContent());

        // Flush so @PreUpdate sets updatedAt before it is returned.
        return mapToResponse(announcementRepository.saveAndFlush(announcement), true);
    }

    /**
     * FR-19: Remove an announcement.
     * Allowed: Trip owners only.
     */
    @Transactional
    public void deleteAnnouncement(
            Long tripId,
            Long announcementId,
            Long currentUserId) {

        tripMemberService.verifyUserIsOwner(tripId, currentUserId);
        announcementRepository.delete(findInTrip(tripId, announcementId));
    }

    // Locked so simultaneous edits/removals of one announcement don't collide.
    // An announcement from another trip is reported as not found rather than
    // revealing that it exists.
    private Announcement findInTrip(Long tripId, Long announcementId) {
        return announcementRepository.lockById(announcementId)
                .filter(announcement -> announcement.getTrip().getTripId().equals(tripId))
                .orElseThrow(() -> new ResourceNotFoundException("Announcement not found"));
    }

    private AnnouncementResponse mapToResponse(Announcement announcement, boolean canManage) {
        return AnnouncementResponse.builder()
                .announcementId(announcement.getAnnouncementId())
                .tripId(announcement.getTrip().getTripId())
                .title(announcement.getTitle())
                .content(announcement.getContent())
                .authorId(announcement.getAuthor().getUserId())
                .authorName(announcement.getAuthor().getUsername())
                .publishedAt(announcement.getPublishedAt())
                .updatedAt(announcement.getUpdatedAt())
                .edited(announcement.getUpdatedAt().isAfter(announcement.getPublishedAt()))
                .canManage(canManage)
                .build();
    }
}
