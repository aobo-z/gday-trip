package com.elec5619.group3.trip_planner_backend.service;

import com.elec5619.group3.trip_planner_backend.dto.*;
import com.elec5619.group3.trip_planner_backend.entity.*;
import com.elec5619.group3.trip_planner_backend.entity.Vote.VoteValue;
import com.elec5619.group3.trip_planner_backend.repository.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class ActivityService {
    private final ActivityRepository activityRepository;
    private final VoteRepository voteRepository;
    private final ActivityCommentRepository commentRepository;
    private final TripRepository tripRepository;
    private final TripMemberRepository memberRepository;
    private final UserRepository userRepository;
    private final ActivityPreferenceRepository preferenceRepository;
    private final TripMemberService memberService;
    private final UpdateHistoryService historyService;
    private final ExpenseRepository expenseRepository;
    private final ActivityImageService imageService;

    @org.springframework.beans.factory.annotation.Value("${app.scheduling.sample-data:false}")
    private boolean sampleDataEnabled;

    public ActivityService(ActivityRepository activityRepository, VoteRepository voteRepository,
                           ActivityCommentRepository commentRepository, TripRepository tripRepository,
                           TripMemberRepository memberRepository, UserRepository userRepository,
                           ActivityPreferenceRepository preferenceRepository, TripMemberService memberService,
                           UpdateHistoryService historyService,
                           ExpenseRepository expenseRepository, ActivityImageService imageService) {
        this.expenseRepository = expenseRepository;
        this.activityRepository = activityRepository;
        this.voteRepository = voteRepository;
        this.commentRepository = commentRepository;
        this.tripRepository = tripRepository;
        this.memberRepository = memberRepository;
        this.userRepository = userRepository;
        this.preferenceRepository = preferenceRepository;
        this.memberService = memberService;
        this.historyService = historyService;
        this.imageService = imageService;
    }

    @Transactional
    public ActivityResponse create(Long tripId, CreateActivityRequest request, Long userId) {
        if (!tripRepository.existsById(tripId)) throw new NoSuchElementException("Trip not found");
        Trip trip = memberService.verifyUserIsMember(tripId, userId).getTrip();
        requireOpenTrip(trip);
        if (request.getDate() != null) tripRepository.lockForScheduling(tripId).orElseThrow();
        Activity activity = new Activity();
        activity.setTrip(trip);
        activity.setCreatedBy(requireUser(userId));
        applyDetails(activity, request, userId);
        activityRepository.saveAndFlush(activity);
        historyService.record(trip, activity.getCreatedBy(), "PROPOSAL_CREATED",
                "Proposed activity #" + activity.getId() + ": " + activity.getName());
        return toResponse(activity, userId);
    }

    /**
     * A new branch, or (with sourceActivityId) a pending or rejected idea taken out of voting as a branch. The idea
     * keeps its row, so its photos, votes, comments and preferred times stay with it; only the time comes from the request.
     */
    @Transactional
    public ActivityResponse createBranch(Long tripId, BranchActivityRequest request, Long userId) {
        TripMember creator = memberService.verifyUserIsMember(tripId, userId);
        requireOpenTrip(creator.getTrip());
        tripRepository.lockForScheduling(tripId).orElseThrow();
        if (request.getMemberIds() != null) memberService.verifyUserIsOwner(tripId, userId);
        Activity branch;
        if (request.getSourceActivityId() != null) {
            branch = lockedActivity(request.getSourceActivityId());
            if (!branch.getTrip().getTripId().equals(tripId)) throw new IllegalArgumentException("That activity belongs to another trip");
            if (branch.isBranch()) return toResponse(branch, userId);
            if (toResponse(branch, userId).getStatus() == ActivityResponse.ProposalStatus.APPROVED) {
                throw new IllegalArgumentException("Only pending or rejected activities can become branches");
            }
            validateSchedule(request.getDate(), request.getStartTime(), request.getEndTime());
            branch.setDate(request.getDate());
            branch.setStartTime(request.getStartTime());
            branch.setEndTime(request.getEndTime());
            if (request.getDate() != null) branch.setEverScheduled(true);
        } else {
            branch = new Activity();
            branch.setTrip(creator.getTrip());
            branch.setCreatedBy(creator.getUser());
            applyBranchDetails(branch, request);
            applyMedia(branch, request.getTags(), request.getImageUrls(), request.getLatitude(), request.getLongitude(), userId);
        }
        branch.setBranch(true);
        branch.getAssignedMembers().clear();
        if (branch.getDate() != null) {
            if (request.getMemberIds() == null) branch.getAssignedMembers().add(creator);
            else setAssignedMembers(branch, request.getMemberIds());
        }
        leaveOverlappingBranches(branch);
        activityRepository.saveAndFlush(branch);
        historyService.record(branch.getTrip(), creator.getUser(), "BRANCH_CREATED",
                "Made a branch #" + branch.getId() + ": " + branch.getName());
        return toResponse(branch, userId);
    }

    /** Sends a branch back to voting, off the timeline; its votes and comments are as they were. */
    @Transactional
    public ActivityResponse removeBranch(Long activityId, Long userId) {
        Activity activity = lockedScheduleActivity(activityId);
        TripMember caller = memberService.verifyUserIsMember(activity.getTrip().getTripId(), userId);
        if (!activity.isBranch()) throw new IllegalStateException("This activity is not a branch");
        activity.setBranch(false);
        // Its branch times don't count as having been scheduled: back in voting it needs approval again.
        activity.setEverScheduled(false);
        activity.setDate(null);
        activity.setStartTime(null);
        activity.setEndTime(null);
        activity.getAssignedMembers().clear();
        activityRepository.saveAndFlush(activity);
        historyService.record(activity.getTrip(), caller.getUser(), "BRANCH_REMOVED",
                "Sent back to voting #" + activityId + ": " + activity.getName());
        return toResponse(activity, userId);
    }

    @Transactional
    public ActivityResponse updateBranch(Long activityId, BranchActivityRequest request, Long userId) {
        Activity branch = lockedScheduleActivity(activityId);
        if (!branch.isBranch()) throw new IllegalArgumentException("Use the activity editor for this activity");
        requireCanModify(branch, userId);
        if (request.getMemberIds() != null) memberService.verifyUserIsOwner(branch.getTrip().getTripId(), userId);
        applyBranchDetails(branch, request);
        if (branch.getDate() == null) branch.getAssignedMembers().clear();
        else if (request.getMemberIds() != null) setAssignedMembers(branch, request.getMemberIds());
        leaveOverlappingBranches(branch);
        activityRepository.saveAndFlush(branch);
        historyService.record(branch.getTrip(), requireUser(userId), "BRANCH_EDITED",
                "Edited branch #" + activityId + ": " + branch.getName());
        return toResponse(branch, userId);
    }

    @Transactional
    public List<ActivityResponse> list(Long tripId, Long userId) {
        if (!tripRepository.existsById(tripId)) throw new NoSuchElementException("Trip not found");
        Trip trip = memberService.verifyUserIsMember(tripId, userId).getTrip();
        if (sampleDataEnabled && activityRepository.findByTrip_TripIdOrderByCreatedAtAscIdAsc(tripId).stream()
                .noneMatch(activity -> "Scheduling test".equals(activity.getCategory()))) {
            createSampleActivities(trip);
        }
        List<Activity> activities = activityRepository.findChronologically(tripId);
        ActivityListData data = new ActivityListData(activeMembers(tripId), activities,
                historyService.scheduledActivityIds(tripId),
                voteRepository.findByActivity_Trip_TripId(tripId).stream().collect(Collectors.groupingBy(vote -> vote.getActivity().getId())),
                commentRepository.countByTrip(tripId).stream().collect(Collectors.toMap(
                        ActivityCommentRepository.ActivityCount::getActivityId, ActivityCommentRepository.ActivityCount::getCount)));
        return activities.stream().map(activity -> toResponse(activity, userId, data)).toList();
    }

    @Transactional(readOnly = true)
    public ActivityResponse get(Long activityId, Long userId) {
        Activity activity = requireActivity(activityId);
        memberService.verifyUserIsMember(activity.getTrip().getTripId(), userId);
        return toResponse(activity, userId);
    }

    /** Pin or move an activity on the trip map; works for every kind of activity, plans included. */
    @Transactional
    public ActivityResponse updateLocation(Long activityId, ActivityLocationRequest request, Long userId) {
        Activity activity = lockedActivity(activityId);
        requireOpenTrip(activity.getTrip());
        requireCanModify(activity, userId);
        applyCoordinates(activity, request.getLatitude(), request.getLongitude());
        activityRepository.saveAndFlush(activity);
        return toResponse(activity, userId);
    }

    @Transactional
    public ActivityResponse update(Long activityId, CreateActivityRequest request, Long userId) {
        Activity activity = lockedScheduleActivity(activityId);
        requireCanModify(activity, userId);
        applyDetails(activity, request, userId);
        if (activity.isBranch()) {
            validateSchedule(activity.getDate(), activity.getStartTime(), activity.getEndTime());
            if (activity.getDate() == null) activity.getAssignedMembers().clear();
            leaveOverlappingBranches(activity);
        }
        activityRepository.saveAndFlush(activity);
        historyService.record(activity.getTrip(), requireUser(userId), "ACTIVITY_EDITED",
                "Edited activity #" + activityId + ": " + activity.getName());
        return toResponse(activity, userId);
    }

    @Transactional
    public ActivityResponse updateSchedule(Long activityId, ActivityScheduleRequest request, Long userId) {
        Activity activity = lockedScheduleActivity(activityId);
        TripMember caller = memberService.verifyUserIsMember(activity.getTrip().getTripId(), userId);
        boolean directPlan = activity.isBranch();
        boolean fromPool = activity.getDate() == null && request.getDate() != null;
        boolean hasScheduleHistory = hasScheduleHistory(activity);
        if (request.getDate() != null && !directPlan && !hasScheduleHistory
                && toResponse(activity, userId).getStatus() != ActivityResponse.ProposalStatus.APPROVED) {
            throw new IllegalStateException("Only approved activities can be scheduled");
        }
        validateSchedule(request.getDate(), request.getStartTime(), request.getEndTime());
        validateGroupSchedule(activity, request.getDate(), request.getStartTime(), request.getEndTime());
        if (hasScheduleHistory || request.getDate() != null) activity.setEverScheduled(true);
        activity.setDate(request.getDate());
        activity.setStartTime(request.getStartTime());
        activity.setEndTime(request.getEndTime());
        if (request.getMemberIds() != null) {
            memberService.verifyUserIsOwner(activity.getTrip().getTripId(), userId);
            Set<Long> memberIds = new HashSet<>(request.getMemberIds());
            if (!directPlan) {
                activityRepository.findByTrip_TripIdOrderByCreatedAtAscIdAsc(activity.getTrip().getTripId()).stream()
                        .filter(branch -> overlaps(activity, branch) && branch.isBranch())
                        .flatMap(branch -> branch.getAssignedMembers().stream())
                        .map(member -> member.getUser().getUserId()).forEach(memberIds::add);
            }
            setAssignedMembers(activity, memberIds);
        } else if (fromPool) {
            if (directPlan) activity.getAssignedMembers().clear(); // branches start with no members
            else {
                activity.getAssignedMembers().clear();
                activity.getAssignedMembers().addAll(activeMembers(activity.getTrip().getTripId()));
            }
        }
        if (directPlan && request.getDate() == null) activity.getAssignedMembers().clear();
        if (directPlan) leaveOverlappingBranches(activity);
        activityRepository.saveAndFlush(activity);
        // Branch moves get their own history type, so they never count as a group plan having been scheduled.
        historyService.record(activity.getTrip(), caller.getUser(),
                (directPlan ? "BRANCH_" : "ACTIVITY_") + (request.getDate() == null ? "UNSCHEDULED" : "SCHEDULED"),
                (request.getDate() == null ? "Unscheduled " : "Scheduled ") + (directPlan ? "branch #" : "#") + activityId + ": " + activity.getName());
        return toResponse(activity, userId);
    }

    @Transactional
    public ActivityResponse joinSchedule(Long activityId, Long userId) {
        Activity activity = lockedScheduleActivity(activityId);
        TripMember member = memberService.verifyUserIsMember(activity.getTrip().getTripId(), userId);
        if (activity.getDate() == null) throw new IllegalStateException("Activity is not scheduled");
        removeFromOverlappingBranches(activity, member);
        activity.getAssignedMembers().add(member);
        activityRepository.saveAndFlush(activity);
        return toResponse(activity, userId);
    }

    @Transactional
    public ActivityResponse leaveSchedule(Long activityId, Long userId) {
        Activity activity = lockedScheduleActivity(activityId);
        TripMember member = memberService.verifyUserIsMember(activity.getTrip().getTripId(), userId);
        activity.getAssignedMembers().removeIf(assigned -> assigned.getTripMemberId().equals(member.getTripMemberId()));
        activityRepository.saveAndFlush(activity);
        return toResponse(activity, userId);
    }

    @Transactional
    public void delete(Long activityId, Long userId) {
        Activity activity = lockedScheduleActivity(activityId);
        requireCanModify(activity, userId);
        // Trip-level log survives deletion; dependent votes/comments/preferences cascade.
        historyService.record(activity.getTrip(), requireUser(userId), "ACTIVITY_DELETED",
                "Deleted activity #" + activityId + ": " + activity.getName());
        expenseRepository.clearActivity(activityId);
        activityRepository.delete(activity);
        activityRepository.flush();
    }

    @Transactional
    public ActivityResponse vote(Long activityId, VoteValue voteValue, Long userId) {
        Activity activity = lockedActivity(activityId);
        if (activity.isBranch()) throw new IllegalStateException("Branches do not participate in voting");
        memberService.verifyUserIsMember(activity.getTrip().getTripId(), userId);
        if (voteValue == null) throw new IllegalArgumentException("Vote must be APPROVE or REJECT");
        Vote vote = voteRepository.findByActivity_IdAndUser_UserId(activityId, userId).orElseGet(Vote::new);
        if (vote.getVoteValue() == voteValue) return toResponse(activity, userId);
        ActivityResponse.ProposalStatus before = toResponse(activity, userId).getStatus();
        vote.setActivity(activity);
        vote.setUser(requireUser(userId));
        vote.setVoteValue(voteValue);
        voteRepository.saveAndFlush(vote);
        ActivityResponse result = toResponse(activity, userId);
        historyService.record(activity.getTrip(), vote.getUser(), "VOTE_CHANGED",
                "Voted " + voteValue + " on #" + activityId + ": " + activity.getName() +
                        " (status " + before + " -> " + result.getStatus() + ")");
        return result;
    }

    /** Takes back the caller's vote, so they count as not having voted yet. */
    @Transactional
    public ActivityResponse withdrawVote(Long activityId, Long userId) {
        Activity activity = lockedActivity(activityId);
        if (activity.isBranch()) throw new IllegalStateException("Branches do not participate in voting");
        memberService.verifyUserIsMember(activity.getTrip().getTripId(), userId);
        Vote vote = voteRepository.findByActivity_IdAndUser_UserId(activityId, userId).orElse(null);
        if (vote == null) return toResponse(activity, userId);
        ActivityResponse.ProposalStatus before = toResponse(activity, userId).getStatus();
        voteRepository.delete(vote);
        voteRepository.flush();
        ActivityResponse result = toResponse(activity, userId);
        historyService.record(activity.getTrip(), vote.getUser(), "VOTE_CHANGED",
                "Withdrew vote on #" + activityId + ": " + activity.getName() +
                        " (status " + before + " -> " + result.getStatus() + ")");
        return result;
    }

    @Transactional(readOnly = true)
    public ActivityPreferencesResponse listPreferences(Long activityId, Long userId) {
        Activity activity = requireActivity(activityId);
        memberService.verifyUserIsMember(activity.getTrip().getTripId(), userId);
        return toPreferences(activity, userId);
    }

    /** Removes one of the caller's preferred dates; other members' preferences are untouched. */
    @Transactional
    public ActivityPreferencesResponse deletePreference(Long activityId, java.time.LocalDate preferredDate, Long userId) {
        Activity activity = lockedActivity(activityId);
        memberService.verifyUserIsMember(activity.getTrip().getTripId(), userId);
        preferenceRepository.findByActivity_IdAndUser_UserIdAndPreferredDate(activityId, userId, preferredDate)
                .ifPresent(preference -> { preferenceRepository.delete(preference); preferenceRepository.flush(); });
        return toPreferences(activity, userId);
    }

    @Transactional
    public ActivityPreferencesResponse savePreference(Long activityId, ActivityPreferenceRequest request, Long userId) {
        Activity activity = lockedActivity(activityId);
        memberService.verifyUserIsMember(activity.getTrip().getTripId(), userId);
        if (request.getPreferredDate() == null) throw new IllegalArgumentException("Preferred date is required");
        validateTimes(request.getPreferredStartTime(), request.getPreferredEndTime());
        ActivityPreference preference = preferenceRepository.findByActivity_IdAndUser_UserIdAndPreferredDate(
                activityId, userId, request.getPreferredDate()).orElseGet(ActivityPreference::new);
        preference.setActivity(activity);
        preference.setUser(requireUser(userId));
        preference.setPreferredDate(request.getPreferredDate());
        preference.setPreferredStartTime(request.getPreferredStartTime());
        preference.setPreferredEndTime(request.getPreferredEndTime());
        preferenceRepository.saveAndFlush(preference);
        historyService.record(activity.getTrip(), preference.getUser(), "PREFERENCE_SAVED",
                "Saved preference for #" + activityId + ": " + activity.getName() + " on " + request.getPreferredDate());
        return toPreferences(activity, userId);
    }

    @Transactional(readOnly = true)
    public List<CommentResponse> listComments(Long activityId, Long userId) {
        Activity activity = requireActivity(activityId);
        memberService.verifyUserIsMember(activity.getTrip().getTripId(), userId);
        return commentRepository.findByActivity_IdOrderByCreatedAtAscIdAsc(activityId).stream()
                .map(this::toCommentResponse).toList();
    }

    @Transactional
    public CommentResponse addComment(Long activityId, String content, Long userId) {
        Activity activity = lockedActivity(activityId);
        memberService.verifyUserIsMember(activity.getTrip().getTripId(), userId);
        String trimmedContent = content == null ? "" : content.trim();
        if (trimmedContent.isBlank() || trimmedContent.length() > 2000) {
            throw new IllegalArgumentException("Comment must contain between 1 and 2000 characters");
        }
        ActivityComment comment = new ActivityComment();
        comment.setActivity(activity);
        comment.setUser(requireUser(userId));
        comment.setContent(trimmedContent);
        commentRepository.saveAndFlush(comment);
        historyService.record(activity.getTrip(), comment.getUser(), "COMMENT_ADDED",
                "Commented on #" + activityId + ": " + activity.getName());
        return toCommentResponse(comment);
    }

    /** The author can take back their own comment; a trip owner can remove any. */
    @Transactional
    public void deleteComment(Long activityId, Long commentId, Long userId) {
        ActivityComment comment = commentRepository.findById(commentId)
                .filter(c -> c.getActivity().getId().equals(activityId))
                .orElseThrow(() -> new NoSuchElementException("Comment not found"));
        TripMember member = memberService.verifyUserIsMember(comment.getActivity().getTrip().getTripId(), userId);
        if (!comment.getUser().getUserId().equals(userId) && !"OWNER".equals(member.getRole())) {
            throw new AccessDeniedException("Only the author or a trip owner can delete this comment");
        }
        commentRepository.delete(comment);
        historyService.record(comment.getActivity().getTrip(), member.getUser(), "COMMENT_DELETED",
                "Deleted a comment on #" + activityId + ": " + comment.getActivity().getName());
    }

    private void applyDetails(Activity activity, CreateActivityRequest request, Long userId) {
        validateTimes(request.getStartTime(), request.getEndTime());
        validateGroupSchedule(activity, request.getDate(), request.getStartTime(), request.getEndTime());
        if (activity.getDate() != null || request.getDate() != null) activity.setEverScheduled(true);
        activity.setName(requiredText(request.getName(), "Name", 160));
        activity.setLocation(requiredText(request.getLocation(), "Location", 200));
        activity.setCategory(requiredText(request.getCategory(), "Category", 80));
        if (request.getDescription() != null && request.getDescription().length() > 2000) {
            throw new IllegalArgumentException("Description and notes must be at most 2000 characters");
        }
        activity.setDescription(request.getDescription() == null ? null : request.getDescription().trim());
        activity.setDate(request.getDate());
        activity.setStartTime(request.getStartTime());
        activity.setEndTime(request.getEndTime());
        applyMedia(activity, request.getTags(), request.getImageUrls(), request.getLatitude(), request.getLongitude(), userId);
    }

    private void applyMedia(Activity activity, List<String> requestTags, List<String> imageUrls, Double latitude, Double longitude, Long userId) {
        if (requestTags != null) {
            if (requestTags.size() > 10) throw new IllegalArgumentException("Use up to 10 tags");
            List<String> tags = requestTags.stream().map(tag -> requiredText(tag, "Tag", 40)).distinct().toList();
            activity.getTags().clear(); activity.getTags().addAll(tags);
        }
        // Omitted media fields preserve uploads during existing scheduling updates.
        if (imageUrls != null) {
            List<String> urls = imageService.validateUrls(imageUrls, userId);
            activity.getImageUrls().clear(); activity.getImageUrls().addAll(urls);
        }
        // Same for coordinates: edit forms don't send them, so leaving them out must not unpin the place.
        if (latitude != null || longitude != null) {
            applyCoordinates(activity, latitude, longitude);
        }
    }

    private void applyCoordinates(Activity activity, Double latitude, Double longitude) {
        if (latitude == null || longitude == null) {
            throw new IllegalArgumentException("Latitude and longitude must be provided together");
        }
        activity.setLatitude(latitude);
        activity.setLongitude(longitude);
    }

    private void applyBranchDetails(Activity branch, BranchActivityRequest request) {
        validateSchedule(request.getDate(), request.getStartTime(), request.getEndTime());
        branch.setName(requiredText(request.getName(), "Name", 160));
        branch.setLocation(requiredText(request.getLocation(), "Location", 200));
        branch.setCategory(requiredText(request.getCategory(), "Category", 80));
        if (request.getDescription() != null && request.getDescription().length() > 2000) {
            throw new IllegalArgumentException("Description and notes must be at most 2000 characters");
        }
        branch.setDescription(request.getDescription() == null ? null : request.getDescription().trim());
        branch.setDate(request.getDate());
        branch.setStartTime(request.getStartTime());
        branch.setEndTime(request.getEndTime());
        if (request.getDate() != null) branch.setEverScheduled(true);
    }

    /** Whoever goes to this branch leaves any other branch at the same time (group plans drop them automatically). */
    private void leaveOverlappingBranches(Activity branch) {
        branch.getAssignedMembers().forEach(member -> removeFromOverlappingBranches(branch, member));
    }

    private boolean overlaps(Activity first, Activity second) {
        return overlaps(first.getDate(), first.getStartTime(), first.getEndTime(), second);
    }

    private boolean overlaps(LocalDate date, LocalTime start, LocalTime end, Activity other) {
        return date != null && start != null && end != null && date.equals(other.getDate())
                && other.getStartTime() != null && other.getEndTime() != null
                && start.isBefore(other.getEndTime()) && end.isAfter(other.getStartTime());
    }

    private void validateGroupSchedule(Activity activity, LocalDate date, LocalTime start, LocalTime end) {
        if (date == null || start == null || end == null || activity.isBranch()) return;
        activityRepository.findChronologically(activity.getTrip().getTripId()).stream()
                .filter(other -> !Objects.equals(other.getId(), activity.getId()) && overlaps(date, start, end, other)
                        && !other.isBranch())
                .findFirst().ifPresent(other -> {
                    throw new IllegalStateException("This time overlaps " + other.getName()
                            + ". Choose another time for this group activity.");
                });
    }

    private void removeFromOverlappingBranches(Activity activity, TripMember member) {
        activityRepository.findByTrip_TripIdOrderByCreatedAtAscIdAsc(activity.getTrip().getTripId()).stream()
                .filter(sibling -> !Objects.equals(sibling.getId(), activity.getId()) && overlaps(activity, sibling)
                        && sibling.isBranch())
                .forEach(sibling -> sibling.getAssignedMembers().removeIf(assigned ->
                        assigned.getTripMemberId().equals(member.getTripMemberId())));
    }

    private String requiredText(String value, String name, int maxLength) {
        if (value == null || value.isBlank() || value.length() > maxLength) {
            throw new IllegalArgumentException(name + " is required and must be at most " + maxLength + " characters");
        }
        return value.trim();
    }

    private void validateTimes(LocalTime start, LocalTime end) {
        if (end != null && (start == null || !end.isAfter(start) || Duration.between(start, end).toMinutes() < 10)) {
            throw new IllegalArgumentException("End time requires a start time, must be at least 10 minutes later, and must be on the same day");
        }
    }

    private void validateSchedule(LocalDate date, LocalTime start, LocalTime end) {
        if (date == null) {
            if (start != null || end != null) throw new IllegalArgumentException("An unscheduled activity cannot have times");
            return;
        }
        if (start == null || end == null || !end.isAfter(start) || Duration.between(start, end).toMinutes() < 10) {
            throw new IllegalArgumentException("A scheduled activity must be at least 10 minutes long and end later on the same day");
        }
    }

    private List<TripMember> activeMembers(Long tripId) {
        return memberRepository.findByTrip_TripId(tripId).stream().filter(TripMember::isActive).toList();
    }

    private void createSampleActivities(Trip trip) {
        List<TripMember> members = activeMembers(trip.getTripId()).stream()
                .filter(member -> !"admin".equalsIgnoreCase(member.getUser().getUsername())).toList();
        if (members.isEmpty()) return;
        User creator = members.get(0).getUser();
        List<Activity> samples = List.of(
                sampleActivity(trip, creator, members, trip.getDestination() + " highlights", trip.getDestination()),
                sampleActivity(trip, creator, members, "Local café stop", trip.getDestination()),
                sampleActivity(trip, creator, members, "Evening market", trip.getDestination()),
                sampleActivity(trip, creator, members, "Landmark visit", trip.getDestination()));
        activityRepository.saveAllAndFlush(samples);
        List<Vote> votes = new ArrayList<>();
        for (Activity activity : samples) {
            for (TripMember member : members) {
                Vote vote = new Vote();
                vote.setActivity(activity);
                vote.setUser(member.getUser());
                vote.setVoteValue(VoteValue.APPROVE);
                votes.add(vote);
            }
        }
        voteRepository.saveAllAndFlush(votes);
    }

    private Activity sampleActivity(Trip trip, User creator, List<TripMember> members, String name, String location) {
        Activity activity = new Activity();
        activity.setTrip(trip);
        activity.setCreatedBy(creator);
        activity.setName(name);
        activity.setLocation(location);
        activity.setCategory("Scheduling test");
        activity.setDescription("Sample plan stored in the trip database for scheduling tests.");
        activity.getAssignedMembers().addAll(members);
        return activity;
    }

    private void setAssignedMembers(Activity activity, Set<Long> userIds) {
        List<TripMember> members = activeMembers(activity.getTrip().getTripId());
        Map<Long, TripMember> byUserId = members.stream()
                .collect(Collectors.toMap(member -> member.getUser().getUserId(), member -> member));
        if (!byUserId.keySet().containsAll(userIds)) {
            throw new IllegalArgumentException("Every assigned user must be an active member of this trip");
        }
        activity.getAssignedMembers().clear();
        userIds.forEach(id -> activity.getAssignedMembers().add(byUserId.get(id)));
    }

    private Activity requireActivity(Long activityId) {
        return activityRepository.findById(activityId)
                .orElseThrow(() -> new NoSuchElementException("Activity not found"));
    }

    private Activity lockedActivity(Long activityId) {
        // Reuse the existing lock for upserts and other writes on the same activity.
        return activityRepository.findForVoting(activityId)
                .orElseThrow(() -> new NoSuchElementException("Activity not found"));
    }

    private Activity lockedScheduleActivity(Long activityId) {
        Long tripId = activityRepository.findTripIdForScheduling(activityId)
                .orElseThrow(() -> new NoSuchElementException("Activity not found"));
        // Read the activity only after acquiring the trip lock, not from a stale persistence context.
        tripRepository.lockForScheduling(tripId).orElseThrow();
        Activity activity = lockedActivity(activityId);
        requireOpenTrip(activity.getTrip());
        return activity;
    }

    /** Archived and published trips keep their plan as it was; only the trip's own details stay editable. */
    private void requireOpenTrip(Trip trip) {
        if (trip.isFinished()) throw new IllegalStateException("This trip has ended, so its plan can't be changed");
    }

    private void requireCanModify(Activity activity, Long userId) {
        TripMember member = memberService.verifyUserIsMember(activity.getTrip().getTripId(), userId);
        if (!activity.getCreatedBy().getUserId().equals(userId) && !"OWNER".equals(member.getRole())) {
            throw new AccessDeniedException("Only the activity creator or a trip owner can edit or delete this activity");
        }
    }

    private User requireUser(Long userId) {
        return userRepository.findById(userId).orElseThrow(() -> new NoSuchElementException("User not found"));
    }

    private record ActivityListData(List<TripMember> members, List<Activity> activities,
                                    Set<Long> scheduledIds, Map<Long, List<Vote>> votes, Map<Long, Long> commentCounts) {}

    private ActivityResponse toResponse(Activity activity, Long currentUserId) {
        return toResponse(activity, currentUserId, null);
    }

    private ActivityResponse toResponse(Activity activity, Long currentUserId, ActivityListData data) {
        List<TripMember> members = data == null ? activeMembers(activity.getTrip().getTripId()) : data.members();
        Set<Long> eligibleUserIds = members.stream().map(member -> member.getUser().getUserId()).collect(Collectors.toSet());
        List<Vote> eligibleVotes = (data == null ? voteRepository.findByActivity_Id(activity.getId())
                : data.votes().getOrDefault(activity.getId(), List.of())).stream()
                .filter(vote -> eligibleUserIds.contains(vote.getUser().getUserId())).toList();
        long approveCount = eligibleVotes.stream().filter(vote -> vote.getVoteValue() == VoteValue.APPROVE).count();
        long rejectCount = eligibleVotes.stream().filter(vote -> vote.getVoteValue() == VoteValue.REJECT).count();
        long eligibleMemberCount = eligibleUserIds.size();
        BigDecimal threshold = activity.getTrip().getVotingThreshold();
        if (threshold == null) threshold = new BigDecimal("0.50");
        // Exact decimal arithmetic avoids a floating-point ceil error (e.g. 0.14 * 50).
        long requiredApprovals = Math.max(1, threshold.multiply(BigDecimal.valueOf(eligibleMemberCount))
                .setScale(0, RoundingMode.CEILING).longValueExact());
        long remaining = eligibleMemberCount - approveCount - rejectCount;
        ActivityResponse.ProposalStatus status = approveCount >= requiredApprovals
                ? ActivityResponse.ProposalStatus.APPROVED
                : approveCount + remaining < requiredApprovals
                ? ActivityResponse.ProposalStatus.REJECTED : ActivityResponse.ProposalStatus.PENDING;
        VoteValue currentVote = eligibleVotes.stream()
                .filter(vote -> vote.getUser().getUserId().equals(currentUserId))
                .map(Vote::getVoteValue).findFirst().orElse(null);
        boolean canModify = activity.getCreatedBy().getUserId().equals(currentUserId) ||
                members.stream().anyMatch(member -> member.getUser().getUserId().equals(currentUserId)
                        && "OWNER".equals(member.getRole()));
        boolean branch = activity.isBranch();
        if (branch) status = ActivityResponse.ProposalStatus.BRANCH;
        boolean canSchedule = !branch
                && (status == ActivityResponse.ProposalStatus.APPROVED || (data == null ? hasScheduleHistory(activity)
                    : activity.isEverScheduled() || activity.getDate() != null || data.scheduledIds().contains(activity.getId())));
        Set<Long> branchMemberIds = !branch
                ? (data == null ? activityRepository.findByTrip_TripIdOrderByCreatedAtAscIdAsc(activity.getTrip().getTripId())
                    : data.activities()).stream()
                    .filter(other -> overlaps(activity, other) && other.isBranch())
                    .flatMap(other -> other.getAssignedMembers().stream())
                    .map(member -> member.getUser().getUserId()).collect(Collectors.toSet())
                : Set.of();
        return ActivityResponse.builder()
                .id(activity.getId()).tripId(activity.getTrip().getTripId())
                .createdById(activity.getCreatedBy().getUserId()).createdByUsername(activity.getCreatedBy().getUsername())
                .name(activity.getName()).location(activity.getLocation()).category(activity.getCategory())
                .description(activity.getDescription()).date(activity.getDate())
                .tags(List.copyOf(activity.getTags())).imageUrls(List.copyOf(activity.getImageUrls()))
                .startTime(activity.getStartTime()).endTime(activity.getEndTime())
                .latitude(activity.getLatitude()).longitude(activity.getLongitude())
                .branch(branch)
                .memberIds(activity.getAssignedMembers().stream().map(member -> member.getUser().getUserId())
                        .filter(id -> !branchMemberIds.contains(id)).sorted().toList())
                .createdAt(activity.getCreatedAt()).updatedAt(activity.getUpdatedAt())
                .approveCount(approveCount).rejectCount(rejectCount).eligibleMemberCount(eligibleMemberCount)
                .requiredApprovals(requiredApprovals).remainingEligibleVotes(remaining).canModify(canModify)
                .canSchedule(canSchedule)
                .commentCount(data == null ? commentRepository.countByActivity_Id(activity.getId()) : data.commentCounts().getOrDefault(activity.getId(), 0L))
                .currentUserVote(currentVote).status(status).build();
    }

    private boolean hasScheduleHistory(Activity activity) {
        return activity.isEverScheduled() || activity.getDate() != null
                || historyService.wasActivityScheduled(activity.getTrip().getTripId(), activity.getId());
    }

    private record PreferenceSlot(LocalDate date, LocalTime start, LocalTime end) {}

    private ActivityPreferencesResponse toPreferences(Activity activity, Long currentUserId) {
        Set<Long> eligible = activeMembers(activity.getTrip().getTripId()).stream()
                .map(member -> member.getUser().getUserId()).collect(Collectors.toSet());
        List<ActivityPreference> preferences = preferenceRepository.findByActivity_IdOrderByPreferredDateAscIdAsc(activity.getId())
                .stream().filter(preference -> eligible.contains(preference.getUser().getUserId())).toList();
        Comparator<PreferenceSlot> order = Comparator.comparing(PreferenceSlot::date)
                .thenComparing(PreferenceSlot::start, Comparator.nullsFirst(Comparator.naturalOrder()))
                .thenComparing(PreferenceSlot::end, Comparator.nullsFirst(Comparator.naturalOrder()));
        Map<PreferenceSlot, Long> counts = new TreeMap<>(order);
        preferences.forEach(preference -> counts.merge(new PreferenceSlot(preference.getPreferredDate(),
                preference.getPreferredStartTime(), preference.getPreferredEndTime()), 1L, Long::sum));
        return new ActivityPreferencesResponse(activity.getId(), eligible.size(),
                preferences.stream().map(preference -> preference.getUser().getUserId()).distinct().count(),
                preferences.stream().filter(preference -> preference.getUser().getUserId().equals(currentUserId))
                        .map(preference -> new ActivityPreferencesResponse.Preference(preference.getId(),
                                preference.getPreferredDate(), preference.getPreferredStartTime(),
                                preference.getPreferredEndTime(), preference.getCreatedAt())).toList(),
                counts.entrySet().stream().map(entry -> new ActivityPreferencesResponse.Slot(
                        entry.getKey().date(), entry.getKey().start(), entry.getKey().end(), entry.getValue())).toList());
    }

    private CommentResponse toCommentResponse(ActivityComment comment) {
        return CommentResponse.builder().id(comment.getId()).authorId(comment.getUser().getUserId())
                .authorUsername(comment.getUser().getUsername()).content(comment.getContent())
                .createdAt(comment.getCreatedAt()).build();
    }
}
