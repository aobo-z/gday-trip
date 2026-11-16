package com.elec5619.group3.trip_planner_backend;

import com.elec5619.group3.trip_planner_backend.dto.ActivityResponse;
import com.elec5619.group3.trip_planner_backend.dto.CreateActivityRequest;
import com.elec5619.group3.trip_planner_backend.entity.*;
import com.elec5619.group3.trip_planner_backend.entity.Vote.VoteValue;
import com.elec5619.group3.trip_planner_backend.repository.*;
import com.elec5619.group3.trip_planner_backend.service.ActivityService;
import com.elec5619.group3.trip_planner_backend.service.TripService;
import com.elec5619.group3.trip_planner_backend.dto.ActivityPreferenceRequest;
import com.elec5619.group3.trip_planner_backend.dto.ActivityPreferencesResponse;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.security.access.AccessDeniedException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("test")
class ActivityServiceTest {
    @Autowired jakarta.persistence.EntityManagerFactory entityManagerFactory;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbcTemplate;
    @Autowired ActivityService activityService;
    @Autowired ActivityRepository activityRepository;
    @Autowired VoteRepository voteRepository;
    @Autowired ActivityCommentRepository commentRepository;
    @Autowired TripMemberRepository memberRepository;
    @Autowired TripRepository tripRepository;
    @Autowired UserRepository userRepository;
    @Autowired ActivityPreferenceRepository preferenceRepository;
    @Autowired UpdateHistoryRepository historyRepository;
    @Autowired TripService tripService;
    @Autowired com.elec5619.group3.trip_planner_backend.service.UpdateHistoryService historyService;

    private Trip trip;
    private User[] users;
    private Activity activity;

    @BeforeEach
    void setUp() {
        commentRepository.deleteAll();
        preferenceRepository.deleteAll();
        historyRepository.deleteAll();
        voteRepository.deleteAll();
        activityRepository.deleteAll();
        memberRepository.deleteAll();
        tripRepository.deleteAll();
        userRepository.deleteAll();
        users = IntStream.range(0, 6).mapToObj(i -> {
            User user = new User();
            user.setUsername("Member " + i);
            user.setEmail("member" + i + "@example.test");
            user.setPasswordHash("hash");
            return userRepository.save(user);
        }).toArray(User[]::new);
        trip = new Trip();
        trip.setName("Sydney"); trip.setDestination("Sydney");
        trip.setStartDate(LocalDate.of(2026, 8, 1)); trip.setEndDate(LocalDate.of(2026, 8, 5));
        trip.setPlannedBudget(BigDecimal.valueOf(1000));
        trip.setVotingThreshold(BigDecimal.valueOf(0.60));
        trip = tripRepository.save(trip);
        for (int i = 0; i < 5; i++) {
            TripMember member = new TripMember(); member.setTrip(trip); member.setUser(users[i]);
            member.setRole(i == 0 ? "OWNER" : "MEMBER"); memberRepository.save(member);
        }
        CreateActivityRequest request = new CreateActivityRequest();
        request.setName("Opera House"); request.setLocation("Circular Quay"); request.setCategory("Culture");
        activity = activityRepository.findById(activityService.create(trip.getTripId(), request, users[0].getUserId()).getId()).orElseThrow();
    }

    @Test void listingActivitiesDoesNotRepeatHistoryAndMemberQueriesForEveryPairOfPlans() {
        var statistics = entityManagerFactory.unwrap(org.hibernate.SessionFactory.class).getStatistics();
        boolean enabled = statistics.isStatisticsEnabled();
        statistics.setStatisticsEnabled(true);
        try {
            for (int size : new int[]{5, 20}) {
                while (activityRepository.count() < size) {
                    Activity plan = new Activity();
                    plan.setTrip(trip); plan.setCreatedBy(users[0]);
                    plan.setName("Plan " + activityRepository.count()); plan.setLocation("Sydney"); plan.setCategory("Activity");
                    activityRepository.saveAndFlush(plan);
                }
                statistics.clear();
                long started = System.nanoTime();
                var response = activityService.list(trip.getTripId(), users[0].getUserId());
                long queries = statistics.getPrepareStatementCount();
                System.out.printf("ACTIVITY_LIST_PERF plans=%d sql=%d elapsed_ms=%.1f%n", size, queries, (System.nanoTime() - started) / 1_000_000.0);
                assertThat(response).hasSize(size);
                assertThat(response).allSatisfy(plan -> {
                    assertThat(plan.getStatus()).isEqualTo(ActivityResponse.ProposalStatus.PENDING);
                    assertThat(plan.isBranch()).isFalse();
                    assertThat(plan.getEligibleMemberCount()).isEqualTo(5);
                });
                if (size == 20) assertThat(queries).as("activity list SQL budget for %s plans", size).isLessThanOrEqualTo(20 + 6L * size);
            }
        } finally { statistics.setStatisticsEnabled(enabled); }
    }

    @Test void savingAndRefreshingSchedulesDoesNotInspectHistoryOfNonOverlappingPlans() {
        while (activityRepository.count() < 20) {
            Activity plan = new Activity();
            plan.setTrip(trip); plan.setCreatedBy(users[0]);
            plan.setName("Plan " + activityRepository.count()); plan.setLocation("Sydney"); plan.setCategory("Activity");
            activityRepository.saveAndFlush(plan);
        }
        for (int i = 0; i < 3; i++) activityService.vote(activity.getId(), VoteValue.APPROVE, users[i].getUserId());
        var statistics = entityManagerFactory.unwrap(org.hibernate.SessionFactory.class).getStatistics();
        boolean enabled = statistics.isStatisticsEnabled();
        statistics.setStatisticsEnabled(true);
        long largest = 0;
        try {
            for (int hour : new int[]{9, 10}) {
                var request = new com.elec5619.group3.trip_planner_backend.dto.ActivityScheduleRequest();
                request.setDate(trip.getStartDate());
                request.setStartTime(java.time.LocalTime.of(hour, 0)); request.setEndTime(java.time.LocalTime.of(hour + 1, 0));
                statistics.clear();
                long started = System.nanoTime();
                activityService.updateSchedule(activity.getId(), request, users[1].getUserId());
                var response = activityService.list(trip.getTripId(), users[1].getUserId());
                long queries = statistics.getPrepareStatementCount();
                largest = Math.max(largest, queries);
                System.out.printf("ACTIVITY_SAVE_PERF phase=%s plans=20 sql=%d elapsed_ms=%.1f%n", hour == 9 ? "first_schedule" : "move", queries, (System.nanoTime() - started) / 1_000_000.0);
                assertThat(response).filteredOn(plan -> plan.getId().equals(activity.getId()))
                        .allSatisfy(plan -> assertThat(plan.getMemberIds()).hasSize(5));
            }
            assertThat(largest).as("save plus canonical refresh SQL budget").isLessThanOrEqualTo(60);
        } finally { statistics.setStatisticsEnabled(enabled); }
    }

    @Test void schedulingHistoryLookupUsesItsTripAndTypeIndex() {
        String plan = jdbcTemplate.queryForObject(
                "EXPLAIN SELECT DISTINCT description FROM update_history WHERE trip_id = ? AND change_type = ?",
                String.class, trip.getTripId(), "BRANCH_CREATED");
        assertThat(plan).containsIgnoringCase("idx_history_trip_type");
        System.out.println("ACTIVITY_HISTORY_INDEX " + plan.replaceAll("\\s+", " "));
    }

    @Test void memberCanApproveAndReject() {
        activityService.vote(activity.getId(), VoteValue.APPROVE, users[0].getUserId());
        assertThat(activityService.get(activity.getId(), users[0].getUserId()).getApproveCount()).isEqualTo(1);
        activityService.vote(activity.getId(), VoteValue.REJECT, users[1].getUserId());
        assertThat(activityService.get(activity.getId(), users[1].getUserId()).getRejectCount()).isEqualTo(1);
    }

    @Test void changingVoteUpdatesExistingRow() {
        activityService.vote(activity.getId(), VoteValue.APPROVE, users[0].getUserId());
        activityService.vote(activity.getId(), VoteValue.REJECT, users[0].getUserId());
        assertThat(voteRepository.findByActivity_Id(activity.getId())).hasSize(1);
        ActivityResponse response = activityService.get(activity.getId(), users[0].getUserId());
        assertThat(response.getApproveCount()).isZero();
        assertThat(response.getRejectCount()).isEqualTo(1);
        assertThat(response.getCurrentUserVote()).isEqualTo(VoteValue.REJECT);
    }

    @Test void thresholdReachedIsApproved() {
        for (int i = 0; i < 3; i++) activityService.vote(activity.getId(), VoteValue.APPROVE, users[i].getUserId());
        assertThat(activityService.get(activity.getId(), users[0].getUserId()).getStatus()).isEqualTo(ActivityResponse.ProposalStatus.APPROVED);
    }

    @Test void thresholdCannotBeReachedIsRejected() {
        ActivityResponse lastVote = null;
        for (int i = 0; i < 3; i++) lastVote = activityService.vote(activity.getId(), VoteValue.REJECT, users[i].getUserId());
        assertThat(lastVote).isNotNull();
        assertThat(lastVote.getStatus()).isEqualTo(ActivityResponse.ProposalStatus.REJECTED);
        assertThat(activityService.get(activity.getId(), users[0].getUserId()).getStatus()).isEqualTo(ActivityResponse.ProposalStatus.REJECTED);
    }

    @Test void undecidedProposalIsPending() {
        activityService.vote(activity.getId(), VoteValue.APPROVE, users[0].getUserId());
        activityService.vote(activity.getId(), VoteValue.REJECT, users[1].getUserId());
        assertThat(activityService.get(activity.getId(), users[0].getUserId()).getStatus()).isEqualTo(ActivityResponse.ProposalStatus.PENDING);
    }

    @Test void nonMemberCannotVoteOrComment() {
        assertThatThrownBy(() -> activityService.vote(activity.getId(), VoteValue.APPROVE, users[5].getUserId())).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> activityService.addComment(activity.getId(), "hello", users[5].getUserId())).isInstanceOf(AccessDeniedException.class);
    }

    @Test void blankCommentIsRejectedAndMemberCommentPersists() {
        assertThatThrownBy(() -> activityService.addComment(activity.getId(), "  ", users[0].getUserId())).isInstanceOf(IllegalArgumentException.class);
        activityService.addComment(activity.getId(), "  Great idea  ", users[0].getUserId());
        assertThat(activityService.listComments(activity.getId(), users[0].getUserId())).extracting("content").containsExactly("Great idea");
    }

    @Test void nonMemberCannotCreateProposal() {
        CreateActivityRequest request = new CreateActivityRequest(); request.setName("Beach"); request.setLocation("Bondi"); request.setCategory("Outdoors");
        assertThatThrownBy(() -> activityService.create(trip.getTripId(), request, users[5].getUserId())).isInstanceOf(AccessDeniedException.class);
    }
    @Test void memberCanSaveAndUpdatePreferenceAndSeeAggregation() {
        ActivityPreferenceRequest first = new ActivityPreferenceRequest();
        first.setPreferredDate(LocalDate.of(2026, 8, 2));
        first.setPreferredStartTime(java.time.LocalTime.of(10, 0));
        first.setPreferredEndTime(java.time.LocalTime.of(12, 0));
        activityService.savePreference(activity.getId(), first, users[1].getUserId());
        first.setPreferredEndTime(java.time.LocalTime.of(13, 0));
        ActivityPreferencesResponse response = activityService.savePreference(activity.getId(), first, users[1].getUserId());
        assertThat(preferenceRepository.findByActivity_IdOrderByPreferredDateAscIdAsc(activity.getId())).hasSize(1);
        assertThat(response.respondingMemberCount()).isEqualTo(1);
        assertThat(response.slots().get(0).preferredEndTime()).isEqualTo(java.time.LocalTime.of(13, 0));
    }

    @Test void ownerCanChangeThresholdAndHistoryIsReadableByMembers() {
        tripService.updateVotingThreshold(trip.getTripId(), BigDecimal.valueOf(0.80), users[0].getUserId());
        assertThat(tripRepository.findById(trip.getTripId()).orElseThrow().getVotingThreshold())
                .isEqualByComparingTo("0.80");
        assertThat(historyRepository.findTop50ByTrip_TripIdOrderByChangedAtDescLogIdDesc(trip.getTripId()))
                .extracting(UpdateHistory::getChangeType).contains("VOTING_THRESHOLD_CHANGED");
    }

    @Test void normalMemberCannotChangeThreshold() {
        assertThatThrownBy(() -> tripService.updateVotingThreshold(trip.getTripId(), BigDecimal.valueOf(0.80), users[1].getUserId()))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test void creatorCanEditButOtherMemberCannotAndDeleteIsLogged() {
        CreateActivityRequest changed = new CreateActivityRequest();
        changed.setName("Updated Opera House");
        changed.setLocation("Circular Quay");
        changed.setCategory("Culture");
        changed.setDate(LocalDate.of(2026, 8, 3));
        activityService.update(activity.getId(), changed, users[0].getUserId());
        assertThatThrownBy(() -> activityService.update(activity.getId(), changed, users[1].getUserId()))
                .isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> activityService.delete(activity.getId(), users[1].getUserId()))
                .isInstanceOf(AccessDeniedException.class);
        activityService.delete(activity.getId(), users[0].getUserId());
        assertThat(activityRepository.findById(activity.getId())).isEmpty();
        assertThat(historyRepository.findTop50ByTrip_TripIdOrderByChangedAtDescLogIdDesc(trip.getTripId()))
                .extracting(UpdateHistory::getChangeType).contains("ACTIVITY_EDITED", "ACTIVITY_DELETED");
    }


    @Test void regularMemberCreatesPendingProposalWithoutAssignedTime() {
        ActivityResponse created = activityService.create(trip.getTripId(), details("Walk"), users[1].getUserId());
        assertThat(created.getCreatedById()).isEqualTo(users[1].getUserId());
        assertThat(created.getStatus()).isEqualTo(ActivityResponse.ProposalStatus.PENDING);
        assertThat(created.getApproveCount()).isZero();
        assertThat(created.getDate()).isNull();
        assertThat(created.getStartTime()).isNull();
        assertThat(created.isCanModify()).isTrue();
        assertThat(activityService.get(created.getId(), users[2].getUserId()).isCanModify()).isFalse();
    }

    @Test void creatorMemberAndOwnerCanEditOtherMembersCannot() {
        ActivityResponse created = activityService.create(trip.getTripId(), details("Walk"), users[1].getUserId());
        assertThat(activityService.update(created.getId(), details("Walk edited"), users[1].getUserId()).getName())
                .isEqualTo("Walk edited");
        assertThat(activityService.update(created.getId(), details("Owner edit"), users[0].getUserId()).getName())
                .isEqualTo("Owner edit");
        assertThatThrownBy(() -> activityService.update(created.getId(), details("Forbidden"), users[2].getUserId()))
                .isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> activityService.delete(created.getId(), users[2].getUserId()))
                .isInstanceOf(AccessDeniedException.class);
        activityService.delete(created.getId(), users[1].getUserId());
        assertThat(activityRepository.existsById(created.getId())).isFalse();
    }

    @Test void listOrdersDatesAndTimesWithUnassignedValuesLast() {
        CreateActivityRequest later = details("Later day");
        later.setDate(LocalDate.of(2026, 8, 4));
        activityService.create(trip.getTripId(), later, users[0].getUserId());
        CreateActivityRequest earlier = details("Morning");
        earlier.setDate(LocalDate.of(2026, 8, 2));
        earlier.setStartTime(java.time.LocalTime.of(9, 0));
        activityService.create(trip.getTripId(), earlier, users[0].getUserId());
        earlier.setName("Early morning"); earlier.setStartTime(java.time.LocalTime.of(8, 0));
        activityService.create(trip.getTripId(), earlier, users[0].getUserId());
        earlier.setName("Time unspecified"); earlier.setStartTime(null);
        activityService.create(trip.getTripId(), earlier, users[0].getUserId());
        assertThat(activityService.list(trip.getTripId(), users[1].getUserId()))
                .filteredOn(response -> !"Scheduling test".equals(response.getCategory()))
                .extracting(ActivityResponse::getName)
                .containsExactly("Early morning", "Morning", "Time unspecified", "Later day", "Opera House");
    }

    @Test void invalidTimesDoNotPersistDetailsOrHistory() {
        long before = historyRepository.count();
        CreateActivityRequest request = details("Invalid");
        request.setStartTime(java.time.LocalTime.of(12, 0));
        request.setEndTime(java.time.LocalTime.of(10, 0));
        assertThatThrownBy(() -> activityService.update(activity.getId(), request, users[0].getUserId()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(activityRepository.findById(activity.getId()).orElseThrow().getName()).isEqualTo("Opera House");
        assertThat(historyRepository.count()).isEqualTo(before);
    }

    @Test void deletingActivityCascadesDependentsButPreservesHistory() {
        activityService.vote(activity.getId(), VoteValue.APPROVE, users[1].getUserId());
        activityService.addComment(activity.getId(), "Saved comment", users[1].getUserId());
        activityService.savePreference(activity.getId(), preference(LocalDate.of(2026, 8, 2)), users[1].getUserId());
        activityService.delete(activity.getId(), users[0].getUserId());
        assertThat(voteRepository.count()).isZero();
        assertThat(commentRepository.count()).isZero();
        assertThat(preferenceRepository.count()).isZero();
        assertThat(historyService.list(trip.getTripId(), users[1].getUserId()))
                .extracting(com.elec5619.group3.trip_planner_backend.dto.UpdateHistoryResponse::changeType)
                .contains("ACTIVITY_DELETED", "COMMENT_ADDED", "VOTE_CHANGED", "PREFERENCE_SAVED", "PROPOSAL_CREATED");
    }

    @Test void preferencesSupportMultipleDatesAndAggregateExactSlots() {
        ActivityPreferenceRequest first = preference(LocalDate.of(2026, 8, 2));
        activityService.savePreference(activity.getId(), first, users[1].getUserId());
        activityService.savePreference(activity.getId(), first, users[2].getUserId());
        ActivityPreferenceRequest second = preference(LocalDate.of(2026, 8, 3));
        ActivityPreferencesResponse response = activityService.savePreference(activity.getId(), second, users[1].getUserId());
        assertThat(response.respondingMemberCount()).isEqualTo(2);
        assertThat(response.currentUserPreferences()).hasSize(2);
        assertThat(response.slots()).extracting(ActivityPreferencesResponse.Slot::memberCount).containsExactly(2L, 1L);
        assertThat(activityService.get(activity.getId(), users[1].getUserId()).getDate()).isNull();
    }

    @Test void aMemberCanTakeBackOneOfTheirPreferredDates() {
        activityService.savePreference(activity.getId(), preference(LocalDate.of(2026, 8, 2)), users[1].getUserId());
        activityService.savePreference(activity.getId(), preference(LocalDate.of(2026, 8, 3)), users[1].getUserId());
        activityService.savePreference(activity.getId(), preference(LocalDate.of(2026, 8, 2)), users[2].getUserId());

        ActivityPreferencesResponse response = activityService.deletePreference(activity.getId(), LocalDate.of(2026, 8, 2), users[1].getUserId());

        assertThat(response.currentUserPreferences()).extracting("preferredDate").containsExactly(LocalDate.of(2026, 8, 3));
        // The other member's vote for that day stays.
        assertThat(response.slots()).extracting(ActivityPreferencesResponse.Slot::memberCount).containsExactly(1L, 1L);
        assertThatThrownBy(() -> activityService.deletePreference(activity.getId(), LocalDate.of(2026, 8, 3), users[5].getUserId()))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test void nonMemberCannotWriteOrReadPreferences() {
        assertThatThrownBy(() -> activityService.savePreference(activity.getId(), preference(LocalDate.of(2026, 8, 2)), users[5].getUserId()))
                .isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> activityService.listPreferences(activity.getId(), users[5].getUserId()))
                .isInstanceOf(AccessDeniedException.class);
        assertThat(preferenceRepository.count()).isZero();
    }

    @Test void malformedPreferenceIsRejected() {
        ActivityPreferenceRequest request = preference(null);
        assertThatThrownBy(() -> activityService.savePreference(activity.getId(), request, users[1].getUserId()))
                .isInstanceOf(IllegalArgumentException.class);
        request.setPreferredDate(LocalDate.of(2026, 8, 2));
        request.setPreferredEndTime(java.time.LocalTime.NOON);
        assertThatThrownBy(() -> activityService.savePreference(activity.getId(), request, users[1].getUserId()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(preferenceRepository.count()).isZero();
    }

    @Test void invalidThresholdsRejectedWithoutChangingTrip() {
        for (String invalid : new String[] {"0", "-0.1", "1.01", "0.001"}) {
            assertThatThrownBy(() -> tripService.updateVotingThreshold(trip.getTripId(), new BigDecimal(invalid), users[0].getUserId()))
                    .isInstanceOf(IllegalArgumentException.class);
        }
        assertThatThrownBy(() -> tripService.updateVotingThreshold(trip.getTripId(), null, users[0].getUserId()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(tripRepository.findById(trip.getTripId()).orElseThrow().getVotingThreshold()).isEqualByComparingTo("0.60");
    }

    @Test void changedThresholdRecalculatesExistingVotes() {
        for (int i = 0; i < 3; i++) activityService.vote(activity.getId(), VoteValue.APPROVE, users[i].getUserId());
        assertThat(activityService.get(activity.getId(), users[0].getUserId()).getStatus()).isEqualTo(ActivityResponse.ProposalStatus.APPROVED);
        tripService.updateVotingThreshold(trip.getTripId(), BigDecimal.ONE, users[0].getUserId());
        assertThat(activityService.get(activity.getId(), users[0].getUserId()).getStatus()).isEqualTo(ActivityResponse.ProposalStatus.PENDING);
        activityService.vote(activity.getId(), VoteValue.REJECT, users[3].getUserId());
        assertThat(activityService.get(activity.getId(), users[0].getUserId()).getStatus()).isEqualTo(ActivityResponse.ProposalStatus.REJECTED);
    }

    @Test void defaultThresholdWorksForNewTripWithoutCustomSetting() {
        com.elec5619.group3.trip_planner_backend.dto.CreateTripRequest request =
                new com.elec5619.group3.trip_planner_backend.dto.CreateTripRequest();
        request.setName("Default trip"); request.setDestination("Sydney");
        request.setStartDate(LocalDate.of(2026, 8, 1)); request.setEndDate(LocalDate.of(2026, 8, 5));
        request.setPlannedBudget(BigDecimal.ZERO);
        var createdTrip = tripService.createTrip(request, users[1].getUserId());
        assertThat(createdTrip.getVotingThreshold()).isEqualByComparingTo("0.50");
        ActivityResponse created = activityService.create(createdTrip.getTripId(), details("Default proposal"), users[1].getUserId());
        assertThat(created.getRequiredApprovals()).isEqualTo(1);
        assertThat(created.getStatus()).isEqualTo(ActivityResponse.ProposalStatus.PENDING);
        assertThat(activityService.vote(created.getId(), VoteValue.APPROVE, users[1].getUserId()).getStatus())
                .isEqualTo(ActivityResponse.ProposalStatus.APPROVED);
    }

    @Test void removedMembersVotesAndPreferencesNoLongerCount() {
        activityService.vote(activity.getId(), VoteValue.APPROVE, users[1].getUserId());
        activityService.savePreference(activity.getId(), preference(LocalDate.of(2026, 8, 2)), users[1].getUserId());
        var removed = memberRepository.findByTrip_TripIdAndUser_UserId(trip.getTripId(), users[1].getUserId()).orElseThrow();
        memberRepository.delete(removed);
        ActivityResponse summary = activityService.get(activity.getId(), users[0].getUserId());
        assertThat(summary.getEligibleMemberCount()).isEqualTo(4);
        assertThat(summary.getApproveCount()).isZero();
        assertThat(summary.getRemainingEligibleVotes()).isEqualTo(4);
        assertThat(activityService.listPreferences(activity.getId(), users[0].getUserId()).respondingMemberCount()).isZero();
        assertThatThrownBy(() -> activityService.vote(activity.getId(), VoteValue.APPROVE, users[1].getUserId()))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test void exactDecimalThresholdDoesNotRoundUpExtraVote() {
        for (int i = 0; i < 45; i++) {
            User user = new User();
            user.setUsername("Extra " + i); user.setEmail("extra" + i + "@example.test"); user.setPasswordHash("hash");
            userRepository.save(user);
            TripMember member = new TripMember(); member.setTrip(trip); member.setUser(user);
            memberRepository.save(member);
        }
        tripService.updateVotingThreshold(trip.getTripId(), new BigDecimal("0.14"), users[0].getUserId());
        assertThat(activityService.get(activity.getId(), users[0].getUserId()).getRequiredApprovals()).isEqualTo(7);
    }

    @Test void historyIncludesActorAndTimeAndIsMemberOnly() {
        activityService.update(activity.getId(), details("Renamed activity"), users[0].getUserId());
        var history = historyService.list(trip.getTripId(), users[1].getUserId());
        assertThat(history.get(0).changeType()).isEqualTo("ACTIVITY_EDITED");
        assertThat(history.get(0).changedById()).isEqualTo(users[0].getUserId());
        assertThat(history.get(0).changedByUsername()).isEqualTo(users[0].getUsername());
        assertThat(history.get(0).changedAt()).isNotNull();
        assertThatThrownBy(() -> historyService.list(trip.getTripId(), users[5].getUserId()))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test void nonMembersCannotReadSharedContentAndMissingObjectsFailCleanly() {
        assertThatThrownBy(() -> activityService.get(activity.getId(), users[5].getUserId())).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> activityService.list(trip.getTripId(), users[5].getUserId())).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> activityService.listComments(activity.getId(), users[5].getUserId())).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> activityService.get(Long.MAX_VALUE, users[0].getUserId())).isInstanceOf(java.util.NoSuchElementException.class);
        assertThatThrownBy(() -> activityService.create(Long.MAX_VALUE, details("Missing trip"), users[0].getUserId())).isInstanceOf(java.util.NoSuchElementException.class);
    }

    @Test void commentsHaveStableChronologicalOrderIncludingTies() {
        var first = activityService.addComment(activity.getId(), "First", users[1].getUserId());
        var second = activityService.addComment(activity.getId(), "Second", users[2].getUserId());
        ActivityComment one = commentRepository.findById(first.getId()).orElseThrow();
        ActivityComment two = commentRepository.findById(second.getId()).orElseThrow();
        one.setCreatedAt(java.time.LocalDateTime.of(2026, 8, 1, 10, 0));
        two.setCreatedAt(one.getCreatedAt());
        commentRepository.saveAllAndFlush(java.util.List.of(one, two));
        assertThat(activityService.listComments(activity.getId(), users[0].getUserId()))
                .extracting(com.elec5619.group3.trip_planner_backend.dto.CommentResponse::getContent).containsExactly("First", "Second");
    }

    @Test void concurrentFirstVotesDoNotCreateDuplicateRows() throws Exception {
        java.util.concurrent.ExecutorService executor = java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            var futures = executor.invokeAll(java.util.List.<java.util.concurrent.Callable<ActivityResponse>>of(
                    () -> activityService.vote(activity.getId(), VoteValue.APPROVE, users[1].getUserId()),
                    () -> activityService.vote(activity.getId(), VoteValue.REJECT, users[1].getUserId())));
            for (var future : futures) future.get(10, java.util.concurrent.TimeUnit.SECONDS);
            assertThat(voteRepository.findByActivity_Id(activity.getId())).hasSize(1);
        } finally { executor.shutdownNow(); }
    }

    private CreateActivityRequest details(String name) {
        CreateActivityRequest request = new CreateActivityRequest();
        request.setName(name); request.setLocation("Sydney"); request.setCategory("Culture");
        return request;
    }

    private ActivityPreferenceRequest preference(LocalDate date) {
        ActivityPreferenceRequest request = new ActivityPreferenceRequest();
        request.setPreferredDate(date);
        return request;
    }

}
