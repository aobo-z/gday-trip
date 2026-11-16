package com.elec5619.group3.trip_planner_backend.scheduling;

import com.elec5619.group3.trip_planner_backend.TestTimes;
import java.time.LocalDateTime;
import com.elec5619.group3.trip_planner_backend.dto.ActivityScheduleRequest;
import com.elec5619.group3.trip_planner_backend.dto.ActivityResponse;
import com.elec5619.group3.trip_planner_backend.dto.BranchActivityRequest;
import com.elec5619.group3.trip_planner_backend.dto.CreateActivityRequest;
import com.elec5619.group3.trip_planner_backend.entity.Trip;
import com.elec5619.group3.trip_planner_backend.entity.TripMember;
import com.elec5619.group3.trip_planner_backend.entity.User;
import com.elec5619.group3.trip_planner_backend.entity.Vote.VoteValue;
import com.elec5619.group3.trip_planner_backend.repository.*;
import com.elec5619.group3.trip_planner_backend.service.ActivityService;
import com.elec5619.group3.trip_planner_backend.service.TripService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(properties = {"app.scheduling.sample-data=true",
        "spring.datasource.url=jdbc:h2:mem:scheduling;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE"})
@ActiveProfiles("test")
class SchedulingServiceTest {
    @Autowired ActivityService activityService;
    @Autowired TripService tripService;
    @Autowired ActivityRepository activityRepository;
    @Autowired VoteRepository voteRepository;
    @Autowired ActivityPreferenceRepository preferenceRepository;
    @Autowired ActivityCommentRepository commentRepository;
    @Autowired UpdateHistoryRepository historyRepository;
    @Autowired TripMemberRepository memberRepository;
    @Autowired TripRepository tripRepository;
    @Autowired UserRepository userRepository;

    private User owner;
    private User member;
    private User secondMember;
    private Trip trip;
    private Long activityId;

    @BeforeEach
    void setUp() {
        commentRepository.deleteAll(); preferenceRepository.deleteAll(); historyRepository.deleteAll();
        voteRepository.deleteAll(); activityRepository.deleteAll(); memberRepository.deleteAll();
        tripRepository.deleteAll(); userRepository.deleteAll();
        owner = user("Amy", "amy@example.test");
        member = user("John", "john@example.test");
        secondMember = user("Mia", "mia@example.test");
        trip = trip("test", "Tokyo", LocalDate.of(2026, 9, 22), LocalDate.of(2026, 10, 6));
        membership(trip, owner, "OWNER"); membership(trip, member, "MEMBER"); membership(trip, secondMember, "MEMBER");
        activityId = activityService.create(trip.getTripId(), activity("Tokyo Museum"), owner.getUserId()).getId();
        activityService.vote(activityId, VoteValue.APPROVE, owner.getUserId());
        activityService.vote(activityId, VoteValue.APPROVE, member.getUserId());
    }

    @Test
    void batchedListKeepsSingleActivityVotingMembersPermissionsAndLegacyHistoryResults() {
        LocalDate date = LocalDate.of(2026, 9, 23);
        activityService.updateSchedule(activityId, schedule(date, LocalTime.of(9, 0), LocalTime.of(10, 0)), owner.getUserId());
        activityService.addComment(activityId, "Meet at the entrance", member.getUserId());
        Long sourceId = activityService.create(trip.getTripId(), activity("Rejected alternative"), member.getUserId()).getId();
        activityService.vote(sourceId, VoteValue.REJECT, owner.getUserId());
        activityService.vote(sourceId, VoteValue.REJECT, secondMember.getUserId());
        BranchActivityRequest request = branch(sourceId, "Rejected alternative", null, null);
        request.setDate(null);
        Long alternativeId = activityService.createBranch(trip.getTripId(), request, member.getUserId()).getId();
        ActivityScheduleRequest attendance = schedule(date, LocalTime.of(9, 0), LocalTime.of(10, 0));
        attendance.setMemberIds(Set.of(member.getUserId(), secondMember.getUserId()));
        activityService.updateSchedule(alternativeId, attendance, owner.getUserId());
        // Both history formats exist in saved databases.
        var created = historyRepository.findTop50ByTrip_TripIdOrderByChangedAtDescLogIdDesc(trip.getTripId()).stream()
                .filter(entry -> "BRANCH_CREATED".equals(entry.getChangeType())).findFirst().orElseThrow();
        created.setDescription("Created branch #" + alternativeId + " for activity #" + activityId);
        historyRepository.saveAndFlush(created);
        for (User caller : List.of(owner, member, secondMember)) {
            activityService.list(trip.getTripId(), caller.getUserId()).forEach(listed ->
                    assertThat(listed).usingRecursiveComparison().withComparatorForType(TestTimes.SAME_MICROSECOND, LocalDateTime.class)
                            .isEqualTo(activityService.get(listed.getId(), caller.getUserId())));
        }
        activityService.updateSchedule(activityId, schedule(null, null, null), member.getUserId());
        var legacy = activityRepository.findById(activityId).orElseThrow();
        legacy.setEverScheduled(false);
        activityRepository.saveAndFlush(legacy);
        activityService.vote(activityId, VoteValue.REJECT, owner.getUserId());
        activityService.vote(activityId, VoteValue.REJECT, member.getUserId());
        activityService.leaveSchedule(alternativeId, member.getUserId());
        activityService.list(trip.getTripId(), member.getUserId()).forEach(listed ->
                assertThat(listed).usingRecursiveComparison().isEqualTo(activityService.get(listed.getId(), member.getUserId())));
        assertThat(activityService.get(activityId, owner.getUserId()).isCanSchedule()).isTrue();
    }

    @Test
    void ownerSchedulesPlanWithRealMembersAndAllFieldsPersist() {
        ActivityScheduleRequest request = schedule(LocalDate.of(2026, 9, 23), LocalTime.of(9, 0), LocalTime.of(10, 30));
        request.setMemberIds(Set.of(owner.getUserId(), member.getUserId()));
        var saved = activityService.updateSchedule(activityId, request, owner.getUserId());

        assertThat(saved.getName()).isEqualTo("Tokyo Museum");
        assertThat(saved.getLocation()).isEqualTo("Ueno");
        assertThat(saved.getDescription()).isEqualTo("Main gallery visit");
        assertThat(saved.getDate()).isEqualTo(request.getDate());
        assertThat(saved.getStartTime()).isEqualTo(LocalTime.of(9, 0));
        assertThat(saved.getEndTime()).isEqualTo(LocalTime.of(10, 30));
        assertThat(saved.getMemberIds()).containsExactlyInAnyOrder(owner.getUserId(), member.getUserId());
        assertThat(activityService.get(activityId, member.getUserId()).getMemberIds()).contains(member.getUserId());
    }

    @Test
    void normalActivitiesCannotOverlapWhenAddedMovedOrEdited() {
        LocalDate date = LocalDate.of(2026, 9, 23);
        activityService.updateSchedule(activityId, schedule(date, LocalTime.of(3, 0), LocalTime.of(4, 0)), owner.getUserId());
        CreateActivityRequest timedCreation = activity("Timed group activity");
        timedCreation.setDate(date); timedCreation.setStartTime(LocalTime.of(3, 10)); timedCreation.setEndTime(LocalTime.of(4, 10));
        assertThatThrownBy(() -> activityService.create(trip.getTripId(), timedCreation, owner.getUserId()))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("overlaps");
        Long incoming = activityService.create(trip.getTripId(), activity("Local cafe"), owner.getUserId()).getId();
        activityService.vote(incoming, VoteValue.APPROVE, owner.getUserId());
        activityService.vote(incoming, VoteValue.APPROVE, member.getUserId());

        assertThatThrownBy(() -> activityService.updateSchedule(incoming,
                schedule(date, LocalTime.of(3, 10), LocalTime.of(4, 10)), member.getUserId()))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("overlaps");
        assertThat(activityService.get(incoming, owner.getUserId()).getDate()).isNull();

        activityService.updateSchedule(incoming, schedule(date, LocalTime.of(4, 0), LocalTime.of(5, 0)), member.getUserId());
        assertThatThrownBy(() -> activityService.updateSchedule(incoming,
                schedule(date, LocalTime.of(3, 30), LocalTime.of(4, 30)), member.getUserId()))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("overlaps");
        CreateActivityRequest edit = activity("Local cafe updated");
        edit.setDate(date); edit.setStartTime(LocalTime.of(3, 30)); edit.setEndTime(LocalTime.of(4, 30));
        assertThatThrownBy(() -> activityService.update(incoming, edit, owner.getUserId()))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("overlaps");
        ActivityResponse unchanged = activityService.get(incoming, owner.getUserId());
        assertThat(unchanged.getName()).isEqualTo("Local cafe");
        assertThat(unchanged.getStartTime()).isEqualTo(LocalTime.of(4, 0));
        assertThat(unchanged.getEndTime()).isEqualTo(LocalTime.of(5, 0));

        ActivityResponse alternative = activityService.createBranch(trip.getTripId(),
                branch(null, "Alternative cafe", LocalTime.of(3, 10), LocalTime.of(4, 10)), member.getUserId());
        assertThat(alternative.getDate()).isEqualTo(date);
        assertThat(alternative.getStartTime()).isEqualTo(LocalTime.of(3, 10));
    }

    @Test
    void concurrentGroupSchedulingCannotPersistTwoActivitiesInTheSameSlot() throws Exception {
        Long second = activityService.create(trip.getTripId(), activity("Other group plan"), owner.getUserId()).getId();
        activityService.vote(second, VoteValue.APPROVE, owner.getUserId());
        activityService.vote(second, VoteValue.APPROVE, member.getUserId());
        var executor = Executors.newFixedThreadPool(2);
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try {
            var writes = List.of(activityId, second).stream().map(id -> CompletableFuture.supplyAsync(() -> {
                ready.countDown();
                try {
                    if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("Scheduling never started");
                    activityService.updateSchedule(id, schedule(LocalDate.of(2026, 9, 23), LocalTime.of(9, 0), LocalTime.of(10, 0)), member.getUserId());
                    return true;
                } catch (IllegalStateException conflict) {
                    assertThat(conflict).hasMessageContaining("overlaps");
                    return false;
                } catch (InterruptedException error) {
                    Thread.currentThread().interrupt(); throw new AssertionError(error);
                }
            }, executor)).toList();
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            assertThat(List.of(writes.get(0).get(10, TimeUnit.SECONDS), writes.get(1).get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true, false);
            assertThat(List.of(activityService.get(activityId, owner.getUserId()), activityService.get(second, owner.getUserId())))
                    .filteredOn(a -> a.getDate() != null).hasSize(1);
        } finally { executor.shutdownNow(); }
    }

    @Test
    void emptyTimelinePlansStayEmptyWhenMovedAndCanBeRejoined() {
        LocalDate date = LocalDate.of(2026, 9, 23);
        activityService.updateSchedule(activityId, schedule(date, LocalTime.of(9, 0), LocalTime.of(10, 0)), owner.getUserId());
        for (User user : List.of(owner, member, secondMember)) activityService.leaveSchedule(activityId, user.getUserId());
        assertThat(activityService.get(activityId, owner.getUserId()).getMemberIds()).isEmpty();
        assertThat(activityService.updateSchedule(activityId, schedule(date, LocalTime.of(10, 0), LocalTime.of(11, 0)), member.getUserId())
                .getMemberIds()).isEmpty();
        assertThat(activityService.joinSchedule(activityId, owner.getUserId()).getMemberIds()).containsExactly(owner.getUserId());

        Long alternative = activityService.createBranch(trip.getTripId(),
                branch(null, "Alternative", LocalTime.of(13, 0), LocalTime.of(14, 0)), owner.getUserId()).getId();
        activityService.leaveSchedule(alternative, owner.getUserId());
        assertThat(activityService.updateSchedule(alternative, schedule(date, LocalTime.of(13, 30), LocalTime.of(14, 30)), member.getUserId())
                .getMemberIds()).isEmpty();
        assertThat(activityService.joinSchedule(alternative, member.getUserId()).getMemberIds()).containsExactly(member.getUserId());
    }

    @Test
    void mainPlanCanReturnToPoolAndMoveWithoutDeletingItsScheduledAlternatives() {
        LocalDate date = LocalDate.of(2026, 9, 23);
        activityService.updateSchedule(activityId, schedule(date, LocalTime.of(9, 0), LocalTime.of(10, 0)), owner.getUserId());
        Long alternativeId = activityService.createBranch(trip.getTripId(),
                branch(null, "Alternative", LocalTime.of(9, 0), LocalTime.of(10, 0)), owner.getUserId()).getId();

        assertThat(activityService.updateSchedule(activityId, schedule(null, null, null), member.getUserId()).getDate()).isNull();
        ActivityResponse alternative = activityService.get(alternativeId, owner.getUserId());
        assertThat(alternative.getDate()).isEqualTo(date);
        assertThat(alternative.getMemberIds()).containsExactly(owner.getUserId());

        activityService.updateSchedule(activityId, schedule(date, LocalTime.of(9, 0), LocalTime.of(10, 0)), owner.getUserId());
        ActivityScheduleRequest sameTime = schedule(date, LocalTime.of(9, 0), LocalTime.of(10, 0));
        activityService.updateSchedule(alternativeId, sameTime, owner.getUserId());
        activityService.updateSchedule(activityId, schedule(date.plusDays(1), LocalTime.of(9, 0), LocalTime.of(10, 0)), member.getUserId());
        assertThat(activityService.get(alternativeId, owner.getUserId()).getDate()).isEqualTo(date);
        activityService.updateSchedule(activityId, schedule(date, LocalTime.of(9, 0), LocalTime.of(10, 0)), owner.getUserId());
        activityService.updateSchedule(alternativeId, sameTime, owner.getUserId());
        CreateActivityRequest edit = activity("Moved museum");
        edit.setDate(date.plusDays(1)); edit.setStartTime(LocalTime.of(9, 0)); edit.setEndTime(LocalTime.of(10, 0));
        activityService.update(activityId, edit, owner.getUserId());
        assertThat(activityService.get(alternativeId, owner.getUserId()).getMemberIds()).containsExactly(owner.getUserId());
    }

    @Test
    void legacyOverlappingGroupPlansCanReturnToTheirPoolsAndRescheduleWithoutChangingAlternatives() {
        LocalDate date = LocalDate.of(2026, 9, 23);
        activityService.updateSchedule(activityId, schedule(date, LocalTime.of(3, 0), LocalTime.of(4, 0)), owner.getUserId());
        Long otherId = approvedSchedule("Other group plan", LocalTime.of(4, 0), LocalTime.of(5, 0));
        // Reproduce schedules already stored before ordinary overlap validation existed.
        var legacy = activityRepository.findById(otherId).orElseThrow();
        legacy.setStartTime(LocalTime.of(3, 10)); legacy.setEndTime(LocalTime.of(4, 10));
        activityRepository.saveAndFlush(legacy);
        Long alternativeId = activityService.createBranch(trip.getTripId(),
                branch(null, "Alternative", LocalTime.of(3, 0), LocalTime.of(4, 0)), owner.getUserId()).getId();
        assertThat(activityService.updateSchedule(activityId, schedule(null, null, null), member.getUserId()).getDate()).isNull();
        assertThat(activityService.updateSchedule(otherId, schedule(null, null, null), member.getUserId()).getDate()).isNull();
        ActivityResponse alternative = activityService.get(alternativeId, member.getUserId());
        assertThat(alternative.getDate()).isEqualTo(date);
        assertThat(alternative.getMemberIds()).containsExactly(owner.getUserId());
        assertThat(activityService.updateSchedule(activityId, schedule(date, LocalTime.of(8, 0), LocalTime.of(9, 0)), member.getUserId()).getDate()).isEqualTo(date);
        assertThat(activityService.updateSchedule(otherId, schedule(date, LocalTime.of(9, 0), LocalTime.of(10, 0)), member.getUserId()).getDate()).isEqualTo(date);
    }

    @Test
    void onlyTripOwnerCanAssignAlternativeMembersThroughEveryWriteEndpoint() {
        BranchActivityRequest creation = branch(null, "Alternative", LocalTime.of(9, 0), LocalTime.of(10, 0));
        creation.setMemberIds(Set.of(owner.getUserId(), secondMember.getUserId()));
        assertThatThrownBy(() -> activityService.createBranch(trip.getTripId(), creation, member.getUserId()))
                .isInstanceOf(AccessDeniedException.class);
        Long alternativeId = activityService.createBranch(trip.getTripId(),
                branch(null, "Alternative", LocalTime.of(9, 0), LocalTime.of(10, 0)), member.getUserId()).getId();
        ActivityScheduleRequest assignment = schedule(LocalDate.of(2026, 9, 23), LocalTime.of(9, 0), LocalTime.of(10, 0));
        assignment.setMemberIds(Set.of(owner.getUserId(), secondMember.getUserId()));
        assertThatThrownBy(() -> activityService.updateSchedule(alternativeId, assignment, member.getUserId()))
                .isInstanceOf(AccessDeniedException.class);
        BranchActivityRequest edit = branch(null, "Changed", LocalTime.of(9, 0), LocalTime.of(10, 0));
        edit.setMemberIds(Set.of(secondMember.getUserId()));
        assertThatThrownBy(() -> activityService.updateBranch(alternativeId, edit, member.getUserId()))
                .isInstanceOf(AccessDeniedException.class);
        assertThat(activityService.get(alternativeId, owner.getUserId()).getName()).isEqualTo("Alternative");
        assertThat(activityService.get(alternativeId, owner.getUserId()).getMemberIds()).containsExactly(member.getUserId());
        assertThat(activityService.updateSchedule(alternativeId, assignment, owner.getUserId()).getMemberIds())
                .containsExactlyInAnyOrder(owner.getUserId(), secondMember.getUserId());
        assertThat(activityService.updateBranch(alternativeId, edit, owner.getUserId()).getMemberIds())
                .containsExactly(secondMember.getUserId());
        edit.setMemberIds(Set.of());
        assertThat(activityService.updateBranch(alternativeId, edit, owner.getUserId()).getMemberIds()).isEmpty();
        assertThat(activityService.joinSchedule(alternativeId, member.getUserId()).getMemberIds()).containsExactly(member.getUserId());
        assertThat(activityService.leaveSchedule(alternativeId, member.getUserId()).getMemberIds()).isEmpty();
    }

    @Test
    void scheduleMustBeAtLeastTenMinutes() {
        assertThatThrownBy(() -> activityService.updateSchedule(activityId,
                schedule(LocalDate.of(2026, 9, 23), LocalTime.of(16, 55), LocalTime.of(17, 4)), owner.getUserId()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("at least 10 minutes");

        CreateActivityRequest invalidEdit = activity("Tokyo Museum");
        invalidEdit.setDate(LocalDate.of(2026, 9, 23));
        invalidEdit.setStartTime(LocalTime.of(16, 55));
        invalidEdit.setEndTime(LocalTime.of(17, 4));
        assertThatThrownBy(() -> activityService.update(activityId, invalidEdit, owner.getUserId()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("at least 10 minutes");

        assertThat(activityService.updateSchedule(activityId,
                schedule(LocalDate.of(2026, 9, 23), LocalTime.of(16, 55), LocalTime.of(17, 5)), owner.getUserId())
                .getEndTime()).isEqualTo(LocalTime.of(17, 5));
    }

    @Test
    void anExistingScheduleCanStillBeEditedAfterItsVoteStatusChanges() {
        activityService.updateSchedule(activityId,
                schedule(LocalDate.of(2026, 9, 23), LocalTime.of(16, 55), LocalTime.of(17, 55)), owner.getUserId());
        activityService.vote(activityId, VoteValue.REJECT, owner.getUserId());
        activityService.vote(activityId, VoteValue.REJECT, member.getUserId());

        var saved = activityService.updateSchedule(activityId,
                schedule(LocalDate.of(2026, 9, 25), LocalTime.of(16, 57), LocalTime.of(17, 7)), owner.getUserId());

        assertThat(saved.getDate()).isEqualTo(LocalDate.of(2026, 9, 25));
        assertThat(saved.getStartTime()).isEqualTo(LocalTime.of(16, 57));
        assertThat(saved.getEndTime()).isEqualTo(LocalTime.of(17, 7));

        var unscheduled = activityService.updateSchedule(activityId, schedule(null, null, null), owner.getUserId());
        assertThat(unscheduled.isCanSchedule()).isTrue();

        // Existing databases have schedule history but no everScheduled column value yet.
        var legacyActivity = activityRepository.findById(activityId).orElseThrow();
        legacyActivity.setEverScheduled(false);
        activityRepository.saveAndFlush(legacyActivity);
        assertThat(activityService.get(activityId, owner.getUserId()).isCanSchedule()).isTrue();

        var rescheduled = activityService.updateSchedule(activityId,
                schedule(LocalDate.of(2026, 9, 26), LocalTime.of(10, 20), LocalTime.of(11, 0)), owner.getUserId());
        assertThat(rescheduled.getDate()).isEqualTo(LocalDate.of(2026, 9, 26));
    }

    @Test
    void aNewScheduleStillRequiresApproval() {
        Long pendingActivity = activityService.create(trip.getTripId(), activity("Pending plan"), owner.getUserId()).getId();

        assertThat(activityService.get(pendingActivity, owner.getUserId()).isCanSchedule()).isFalse();

        assertThatThrownBy(() -> activityService.updateSchedule(pendingActivity,
                schedule(LocalDate.of(2026, 9, 25), LocalTime.of(16, 57), LocalTime.of(17, 7)), owner.getUserId()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Only approved activities");
    }

    @Test
    void tripGetsFourDatabaseBackedApprovedUnscheduledTestPlansOnce() {
        Trip emptyTrip = trip("empty", "Osaka", LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 3));
        membership(emptyTrip, owner, "OWNER");
        membership(emptyTrip, member, "MEMBER");

        List<ActivityResponse> samples = activityService.list(emptyTrip.getTripId(), owner.getUserId());
        activityService.list(emptyTrip.getTripId(), owner.getUserId());

        assertThat(samples).hasSize(4);
        assertThat(activityRepository.findByTrip_TripIdOrderByCreatedAtAscIdAsc(emptyTrip.getTripId())).hasSize(4);
        assertThat(samples).allSatisfy(sample -> {
            assertThat(sample.getStatus()).isEqualTo(ActivityResponse.ProposalStatus.APPROVED);
            assertThat(sample.getDate()).isNull();
            assertThat(sample.getStartTime()).isNull();
            assertThat(sample.getEndTime()).isNull();
            assertThat(sample.getMemberIds()).containsExactlyInAnyOrder(owner.getUserId(), member.getUserId());
        });
    }

    @Test
    void tripMemberCanRescheduleAndSwitchOwnPlanButCannotAssignOtherMembers() {
        activityService.updateSchedule(activityId, schedule(LocalDate.of(2026, 9, 23), LocalTime.of(9, 0), LocalTime.of(10, 30)), member.getUserId());
        assertThat(activityService.get(activityId, member.getUserId()).getMemberIds()).contains(member.getUserId());
        activityService.leaveSchedule(activityId, member.getUserId());
        assertThat(activityService.get(activityId, member.getUserId()).getMemberIds()).doesNotContain(member.getUserId());
        activityService.joinSchedule(activityId, member.getUserId());
        assertThat(activityService.get(activityId, member.getUserId()).getMemberIds()).contains(member.getUserId());

        Long secondPlan = activityService.create(trip.getTripId(), activity("Evening Market"), owner.getUserId()).getId();
        activityService.vote(secondPlan, VoteValue.APPROVE, owner.getUserId());
        activityService.vote(secondPlan, VoteValue.APPROVE, secondMember.getUserId());
        ActivityScheduleRequest secondSchedule = schedule(LocalDate.of(2026, 9, 24), LocalTime.of(18, 0), LocalTime.of(19, 30));
        secondSchedule.setMemberIds(Set.of(owner.getUserId()));
        activityService.updateSchedule(secondPlan, secondSchedule, owner.getUserId());
        activityService.leaveSchedule(activityId, member.getUserId());
        activityService.joinSchedule(secondPlan, member.getUserId());
        assertThat(activityService.get(activityId, member.getUserId()).getMemberIds()).doesNotContain(member.getUserId());
        assertThat(activityService.get(secondPlan, member.getUserId()).getMemberIds()).contains(member.getUserId());

        ActivityScheduleRequest forbidden = schedule(LocalDate.of(2026, 9, 24), LocalTime.of(10, 20), LocalTime.of(11, 0));
        forbidden.setMemberIds(Set.of(owner.getUserId()));
        assertThatThrownBy(() -> activityService.updateSchedule(activityId, forbidden, member.getUserId()))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void schedulesStayInsideTheirOwnTripAndPublishingPersists() {
        Trip other = trip("test_trip_2", "Sydney", LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 5));
        membership(other, owner, "OWNER");
        Long otherActivity = activityService.create(other.getTripId(), activity("Opera House"), owner.getUserId()).getId();
        activityService.vote(otherActivity, VoteValue.APPROVE, owner.getUserId());
        activityService.updateSchedule(activityId, schedule(LocalDate.of(2026, 9, 23), LocalTime.of(9, 0), LocalTime.of(10, 30)), owner.getUserId());
        activityService.updateSchedule(otherActivity, schedule(LocalDate.of(2026, 11, 2), LocalTime.of(10, 20), LocalTime.of(11, 0)), owner.getUserId());

        assertThat(activityService.list(trip.getTripId(), owner.getUserId())).extracting("name")
                .contains("Tokyo Museum").doesNotContain("Opera House");
        assertThat(activityService.list(other.getTripId(), owner.getUserId())).extracting("name")
                .contains("Opera House").doesNotContain("Tokyo Museum");
        assertThat(tripService.startTrip(trip.getTripId(), owner.getUserId()).getStatus()).isEqualTo("ONGOING");
        assertThat(tripRepository.findById(trip.getTripId()).orElseThrow().getStatus()).isEqualTo("ONGOING");
    }

    @Test
    void anyMemberCanCreateAnOverlappingBranchWithoutChangingTheMainVote() {
        activityService.updateSchedule(activityId,
                schedule(LocalDate.of(2026, 9, 23), LocalTime.of(9, 0), LocalTime.of(12, 0)), owner.getUserId());
        Long rejectedSource = activityService.create(trip.getTripId(), activity("Harbour Bridge"), owner.getUserId()).getId();
        activityService.vote(rejectedSource, VoteValue.REJECT, owner.getUserId());
        activityService.vote(rejectedSource, VoteValue.REJECT, member.getUserId());
        ActivityResponse mainBefore = activityService.get(activityId, owner.getUserId());

        ActivityResponse branch = activityService.createBranch(trip.getTripId(),
                branch(rejectedSource, "Harbour Bridge", LocalTime.of(8, 15), LocalTime.of(11, 30)),
                secondMember.getUserId());

        assertThat(branch.getMemberIds()).containsExactly(secondMember.getUserId());
        assertThat(branch.isCanSchedule()).isFalse();
        assertThat(branch.getId()).isEqualTo(rejectedSource);
        assertThat(branch.getStatus()).isEqualTo(ActivityResponse.ProposalStatus.BRANCH);
        ActivityResponse mainAfter = activityService.get(activityId, owner.getUserId());
        assertThat(mainAfter.getStatus()).isEqualTo(ActivityResponse.ProposalStatus.APPROVED);
        assertThat(mainAfter.getApproveCount()).isEqualTo(mainBefore.getApproveCount());
        assertThat(mainAfter.getMemberIds()).doesNotContain(secondMember.getUserId());

        ActivityScheduleRequest ownerEdit = schedule(LocalDate.of(2026, 9, 23), LocalTime.of(9, 0), LocalTime.of(12, 0));
        ownerEdit.setMemberIds(Set.of(owner.getUserId(), member.getUserId()));
        activityService.updateSchedule(activityId, ownerEdit, owner.getUserId());
        activityService.leaveSchedule(branch.getId(), secondMember.getUserId());
        assertThat(activityService.get(activityId, owner.getUserId()).getMemberIds()).contains(secondMember.getUserId());
    }

    @Test
    void joiningAnotherBranchSwitchesAlternativesAndJoiningMainLeavesTheBranch() {
        activityService.updateSchedule(activityId,
                schedule(LocalDate.of(2026, 9, 23), LocalTime.of(9, 0), LocalTime.of(12, 0)), owner.getUserId());
        ActivityResponse first = activityService.createBranch(trip.getTripId(),
                branch(null, "Aquarium", LocalTime.of(9, 15), LocalTime.of(10, 30)), owner.getUserId());
        ActivityResponse second = activityService.createBranch(trip.getTripId(),
                branch(null, "Harbour Walk", LocalTime.of(10, 0), LocalTime.of(11, 45)), secondMember.getUserId());

        activityService.joinSchedule(first.getId(), member.getUserId());
        activityService.joinSchedule(second.getId(), member.getUserId());

        assertThat(activityService.get(first.getId(), member.getUserId()).getMemberIds()).doesNotContain(member.getUserId());
        assertThat(activityService.get(second.getId(), member.getUserId()).getMemberIds()).contains(member.getUserId());
        assertThat(activityService.get(activityId, member.getUserId()).getMemberIds()).doesNotContain(member.getUserId());

        activityService.joinSchedule(activityId, member.getUserId());
        assertThat(activityService.get(second.getId(), member.getUserId()).getMemberIds()).doesNotContain(member.getUserId());
        assertThat(activityService.get(activityId, member.getUserId()).getMemberIds()).contains(member.getUserId());
    }

    @Test
    void branchRejectsApprovedSourcesAndBothPlansCanReturnToTheirPoolsIndependently() {
        activityService.updateSchedule(activityId,
                schedule(LocalDate.of(2026, 9, 23), LocalTime.of(9, 0), LocalTime.of(12, 0)), owner.getUserId());

        assertThatThrownBy(() -> activityService.createBranch(trip.getTripId(),
                branch(activityId, "Copy", LocalTime.of(9, 0), LocalTime.of(10, 0)), member.getUserId()))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("Only pending or rejected activities");
        ActivityResponse branch = activityService.createBranch(trip.getTripId(),
                branch(null, "Aquarium", LocalTime.of(9, 0), LocalTime.of(10, 0)), member.getUserId());
        assertThat(activityService.updateSchedule(activityId, schedule(null, null, null), member.getUserId()).getDate()).isNull();
        ActivityResponse pending = activityService.updateSchedule(branch.getId(), schedule(null, null, null), member.getUserId());
        assertThat(pending.getDate()).isNull();
        assertThat(pending.isBranch()).isTrue();
        assertThat(activityService.updateSchedule(activityId, schedule(null, null, null), member.getUserId()).getDate()).isNull();
    }

    @ParameterizedTest
    @EnumSource(value = ActivityResponse.ProposalStatus.class, names = {"PENDING", "REJECTED"})
    void anIdeaBecomesABranchInPlaceKeepingItsVotesTagsAndCommentsButNotItsProposedTime(ActivityResponse.ProposalStatus status) {
        CreateActivityRequest proposal = activity("Evening market");
        proposal.setDate(LocalDate.of(2026, 9, 23));
        proposal.setStartTime(LocalTime.of(17, 10));
        proposal.setEndTime(LocalTime.of(18, 10));
        proposal.setTags(List.of("Food"));
        Long sourceId = activityService.create(trip.getTripId(), proposal, owner.getUserId()).getId();
        activityService.vote(sourceId, status == ActivityResponse.ProposalStatus.PENDING ? VoteValue.APPROVE : VoteValue.REJECT, owner.getUserId());
        activityService.vote(sourceId, VoteValue.REJECT, member.getUserId());
        activityService.addComment(sourceId, "Worth a look", member.getUserId());
        ActivityResponse before = activityService.get(sourceId, owner.getUserId());
        assertThat(before.getStatus()).isEqualTo(status);
        int countBefore = activityService.list(trip.getTripId(), owner.getUserId()).size();
        BranchActivityRequest request = branch(sourceId, "Evening market", null, null);
        request.setDate(null);

        ActivityResponse branch = activityService.createBranch(trip.getTripId(), request, secondMember.getUserId());
        assertThat(branch.getId()).isEqualTo(sourceId);
        assertThat(branch.getStatus()).isEqualTo(ActivityResponse.ProposalStatus.BRANCH);
        assertThat(branch.isBranch()).isTrue();
        assertThat(branch.getDate()).isNull();
        assertThat(branch.getStartTime()).isNull();
        assertThat(branch.getTags()).containsExactly("Food");
        assertThat(branch.getCommentCount()).isEqualTo(1);
        assertThat(branch.getApproveCount()).isEqualTo(before.getApproveCount());
        assertThat(branch.getRejectCount()).isEqualTo(before.getRejectCount());
        assertThat(activityService.list(trip.getTripId(), member.getUserId())).hasSize(countBefore);

        ActivityResponse scheduled = activityService.updateSchedule(sourceId,
                schedule(LocalDate.of(2026, 9, 23), LocalTime.of(10, 0), LocalTime.of(11, 0)), member.getUserId());
        assertThat(scheduled.getStartTime()).isEqualTo(LocalTime.of(10, 0));
        // Asking again changes nothing.
        assertThat(activityService.createBranch(trip.getTripId(), request, owner.getUserId()).getStartTime()).isEqualTo(LocalTime.of(10, 0));
    }

    @Test
    void ideasCanBecomeBranchesWithATimeAndTheCreatorGoes() {
        Long pending = activityService.create(trip.getTripId(), activity("Pending place"), owner.getUserId()).getId();
        ActivityResponse branch = activityService.createBranch(trip.getTripId(),
                branch(pending, "Ignored name", LocalTime.of(14, 0), LocalTime.of(15, 0)), member.getUserId());
        assertThat(branch.getId()).isEqualTo(pending);
        assertThat(branch.getName()).isEqualTo("Pending place");
        assertThat(branch.getDate()).isEqualTo(LocalDate.of(2026, 9, 23));
        assertThat(branch.getMemberIds()).containsExactly(member.getUserId());
        assertThat(branch.getApproveCount()).isZero();
    }

    @Test
    void sendingABranchBackToVotingTakesItOffTheTimelineAndItNeedsApprovalAgain() {
        activityService.updateSchedule(activityId,
                schedule(LocalDate.of(2026, 9, 23), LocalTime.of(9, 0), LocalTime.of(12, 0)), owner.getUserId());
        Long sourceId = activityService.create(trip.getTripId(), activity("Rejected place"), owner.getUserId()).getId();
        activityService.vote(sourceId, VoteValue.REJECT, owner.getUserId());
        activityService.vote(sourceId, VoteValue.REJECT, member.getUserId());
        activityService.createBranch(trip.getTripId(), branch(sourceId, "Rejected place", LocalTime.of(10, 0), LocalTime.of(11, 0)), member.getUserId());
        assertThat(activityService.get(activityId, owner.getUserId()).getMemberIds()).doesNotContain(member.getUserId());

        ActivityResponse back = activityService.removeBranch(sourceId, secondMember.getUserId());
        assertThat(back.isBranch()).isFalse();
        assertThat(back.getStatus()).isEqualTo(ActivityResponse.ProposalStatus.REJECTED);
        assertThat(back.getDate()).isNull();
        assertThat(back.getStartTime()).isNull();
        assertThat(back.getMemberIds()).isEmpty();
        assertThat(back.isCanSchedule()).isFalse();
        assertThat(activityService.get(activityId, owner.getUserId()).getMemberIds()).contains(member.getUserId());
        assertThatThrownBy(() -> activityService.updateSchedule(sourceId,
                schedule(LocalDate.of(2026, 9, 24), LocalTime.of(10, 0), LocalTime.of(11, 0)), owner.getUserId()))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("Only approved activities");
        assertThat(activityService.vote(sourceId, VoteValue.APPROVE, owner.getUserId()).getApproveCount()).isEqualTo(1);
        assertThatThrownBy(() -> activityService.removeBranch(activityId, owner.getUserId()))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("not a branch");
    }

    @Test
    void aMemberCanWithdrawTheirVoteAndTheStatusFollows() {
        assertThat(activityService.get(activityId, member.getUserId()).getStatus()).isEqualTo(ActivityResponse.ProposalStatus.APPROVED);
        ActivityResponse after = activityService.withdrawVote(activityId, member.getUserId());
        assertThat(after.getCurrentUserVote()).isNull();
        assertThat(after.getApproveCount()).isEqualTo(1);
        assertThat(after.getStatus()).isEqualTo(ActivityResponse.ProposalStatus.PENDING);
        assertThat(activityService.withdrawVote(activityId, member.getUserId()).getApproveCount()).isEqualTo(1);
    }

    @Test
    void aBranchCannotBeVotedOnAndIsNotConvertedTwice() {
        Long sourceId = activityService.create(trip.getTripId(), activity("Changing proposal"), owner.getUserId()).getId();
        BranchActivityRequest request = branch(sourceId, "Changing proposal", null, null);
        request.setDate(null);
        Long branchId = activityService.createBranch(trip.getTripId(), request, member.getUserId()).getId();
        assertThatThrownBy(() -> activityService.vote(sourceId, VoteValue.REJECT, owner.getUserId()))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("do not participate in voting");
        assertThat(activityService.createBranch(trip.getTripId(), request, secondMember.getUserId()).getId()).isEqualTo(branchId);
        assertThat(activityService.list(trip.getTripId(), owner.getUserId()))
                .filteredOn(plan -> plan.getName().equals("Changing proposal")).hasSize(1);
    }

    @Test
    void concurrentConversionsOfTheSameRejectedIdeaLeaveOneBranch() throws Exception {
        Long sourceId = activityService.create(trip.getTripId(), activity("Rejected place"), owner.getUserId()).getId();
        activityService.vote(sourceId, VoteValue.REJECT, owner.getUserId());
        activityService.vote(sourceId, VoteValue.REJECT, member.getUserId());
        BranchActivityRequest request = branch(sourceId, "Rejected place", null, null);
        request.setDate(null);
        var executor = Executors.newFixedThreadPool(2);
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try {
            var additions = List.of(member, secondMember).stream().map(user -> CompletableFuture.supplyAsync(() -> {
                ready.countDown();
                try {
                    if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("Addition never started");
                } catch (InterruptedException error) {
                    Thread.currentThread().interrupt(); throw new AssertionError(error);
                }
                return activityService.createBranch(trip.getTripId(), request, user.getUserId()).getId();
            }, executor)).toList();
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            assertThat(additions.get(0).get(10, TimeUnit.SECONDS)).isEqualTo(sourceId);
            assertThat(additions.get(1).get(10, TimeUnit.SECONDS)).isEqualTo(sourceId);
            assertThat(activityService.list(trip.getTripId(), owner.getUserId()))
                    .filteredOn(a -> a.getName().equals("Rejected place")).hasSize(1).allMatch(ActivityResponse::isBranch);
        } finally { executor.shutdownNow(); }
    }

    @Test
    void alternativeTypeSurvivesHistoryRemovalSchedulingAndReturningToItsPool() {
        BranchActivityRequest request = branch(null, "Independent alternative", null, null);
        request.setDate(null);
        Long alternativeId = activityService.createBranch(trip.getTripId(), request, member.getUserId()).getId();
        historyRepository.deleteAll();

        assertThat(activityService.get(alternativeId, owner.getUserId()).isBranch()).isTrue();
        assertThatThrownBy(() -> activityService.vote(alternativeId, VoteValue.APPROVE, owner.getUserId()))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("do not participate in voting");
        ActivityResponse scheduled = activityService.updateSchedule(alternativeId,
                schedule(LocalDate.of(2026, 9, 23), LocalTime.of(10, 0), LocalTime.of(11, 0)), member.getUserId());
        assertThat(scheduled.isBranch()).isTrue();
        activityService.updateSchedule(alternativeId, schedule(null, null, null), member.getUserId());
        historyRepository.deleteAll();
        assertThat(activityService.list(trip.getTripId(), member.getUserId()))
                .filteredOn(activity -> activity.getId().equals(alternativeId))
                .allMatch(ActivityResponse::isBranch).hasSize(1);
        assertThat(activityService.get(activityId, owner.getUserId()).isBranch()).isFalse();
    }

    @Test
    void branchCanBeAddedWithoutATimeAndScheduledByATripMemberWithoutVoting() {
        activityService.updateSchedule(activityId,
                schedule(LocalDate.of(2026, 9, 23), LocalTime.of(9, 0), LocalTime.of(12, 0)), owner.getUserId());
        BranchActivityRequest request = branch(null, "Blue Mountains", null, null);
        request.setDate(null);
        ActivityResponse pending = activityService.createBranch(trip.getTripId(), request, member.getUserId());
        assertThat(pending.getDate()).isNull();
        assertThat(pending.getStartTime()).isNull();
        assertThat(pending.getEndTime()).isNull();
        assertThat(pending.isBranch()).isTrue();
        assertThat(pending.getApproveCount()).isZero();
        assertThat(pending.getMemberIds()).isEmpty();
        assertThat(activityRepository.findById(pending.getId()).orElseThrow().isEverScheduled()).isFalse();
        assertThat(activityService.get(activityId, owner.getUserId()).getMemberIds()).contains(member.getUserId());
        assertThatThrownBy(() -> activityService.vote(pending.getId(), VoteValue.APPROVE, owner.getUserId()))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("do not participate in voting");

        request.setName("Blue Mountains National Park");
        assertThat(activityService.updateBranch(pending.getId(), request, member.getUserId()).getDate()).isNull();
        ActivityScheduleRequest attendance = schedule(LocalDate.of(2026, 9, 23), LocalTime.of(10, 0), LocalTime.of(11, 0));
        attendance.setMemberIds(Set.of(member.getUserId()));
        ActivityResponse scheduled = activityService.updateSchedule(pending.getId(), attendance, owner.getUserId());
        assertThat(scheduled.getMemberIds()).containsExactly(member.getUserId());
        assertThat(scheduled.getStartTime()).isEqualTo(LocalTime.of(10, 0));
        assertThat(activityService.get(activityId, owner.getUserId()).getApproveCount()).isEqualTo(2);
        assertThat(activityService.get(activityId, owner.getUserId()).getMemberIds()).doesNotContain(member.getUserId());

        ActivityResponse moved = activityService.updateSchedule(pending.getId(),
                schedule(LocalDate.of(2026, 9, 24), LocalTime.of(14, 0), LocalTime.of(15, 0)), secondMember.getUserId());
        assertThat(activityService.get(activityId, owner.getUserId()).getMemberIds()).contains(member.getUserId());
        ActivityResponse returned = activityService.updateSchedule(pending.getId(), schedule(null, null, null), secondMember.getUserId());
        assertThat(returned.getDate()).isNull();
        assertThat(returned.getStartTime()).isNull();
        assertThat(returned.getEndTime()).isNull();
        assertThat(returned.getMemberIds()).isEmpty();
        assertThat(returned.isBranch()).isTrue();
        assertThat(returned.isCanSchedule()).isFalse();
        assertThat(activityService.list(trip.getTripId(), member.getUserId()))
                .filteredOn(ActivityResponse::isBranch).extracting(ActivityResponse::getId).containsExactly(pending.getId());
    }

    @Test
    void selectedAlternativeMembersLeaveEveryOverlappingGroupActivityAndReturnWhenTheAlternativeChanges() {
        Long adjacent = approvedSchedule("Breakfast", LocalTime.of(8, 0), LocalTime.of(9, 0));
        Long partialOverlap = approvedSchedule("Gallery", LocalTime.of(10, 30), LocalTime.of(11, 30));
        activityService.updateSchedule(activityId,
                schedule(LocalDate.of(2026, 9, 23), LocalTime.of(9, 0), LocalTime.of(10, 0)), owner.getUserId());
        BranchActivityRequest request = branch(null, "Alternative", null, null);
        request.setDate(null);
        ActivityResponse pending = activityService.createBranch(trip.getTripId(), request, owner.getUserId());
        ActivityScheduleRequest attendance = schedule(LocalDate.of(2026, 9, 23), LocalTime.of(9, 0), LocalTime.of(11, 0));
        attendance.setMemberIds(Set.of(member.getUserId(), secondMember.getUserId()));
        assertThat(activityService.updateSchedule(pending.getId(), attendance, owner.getUserId()).getMemberIds())
                .containsExactlyInAnyOrder(member.getUserId(), secondMember.getUserId());
        for (Long groupId : List.of(activityId, partialOverlap)) {
            assertThat(activityService.get(groupId, owner.getUserId()).getMemberIds()).containsExactly(owner.getUserId());
        }
        assertThat(activityService.get(adjacent, owner.getUserId()).getMemberIds())
                .containsExactlyInAnyOrder(owner.getUserId(), member.getUserId(), secondMember.getUserId());

        BranchActivityRequest edit = branch(null, "Alternative", LocalTime.of(9, 0), LocalTime.of(11, 0));
        edit.setMemberIds(Set.of(owner.getUserId()));
        assertThat(activityService.updateBranch(pending.getId(), edit, owner.getUserId()).getMemberIds()).containsExactly(owner.getUserId());
        assertThat(activityService.get(activityId, member.getUserId()).getMemberIds())
                .containsExactlyInAnyOrder(member.getUserId(), secondMember.getUserId());
        activityService.updateSchedule(pending.getId(),
                schedule(LocalDate.of(2026, 9, 24), LocalTime.of(9, 0), LocalTime.of(10, 0)), member.getUserId());
        assertThat(activityService.get(activityId, member.getUserId()).getMemberIds())
                .containsExactlyInAnyOrder(owner.getUserId(), member.getUserId(), secondMember.getUserId());
        activityService.updateSchedule(pending.getId(), attendance, owner.getUserId());
        activityService.updateSchedule(pending.getId(), schedule(null, null, null), member.getUserId());
        assertThat(activityService.get(pending.getId(), owner.getUserId()).getMemberIds()).isEmpty();
        assertThat(activityService.get(partialOverlap, member.getUserId()).getMemberIds())
                .containsExactlyInAnyOrder(owner.getUserId(), member.getUserId(), secondMember.getUserId());
        activityService.updateSchedule(pending.getId(), attendance, owner.getUserId());
        activityService.delete(pending.getId(), owner.getUserId());
        assertThat(activityService.get(activityId, member.getUserId()).getMemberIds())
                .containsExactlyInAnyOrder(owner.getUserId(), member.getUserId(), secondMember.getUserId());
    }

    @Test
    void aGroupActivityAddedAfterAnAlternativeStillExcludesTheSelectedMembers() {
        BranchActivityRequest request = branch(null, "First alternative", null, null);
        request.setDate(null);
        ActivityResponse pending = activityService.createBranch(trip.getTripId(), request, owner.getUserId());
        ActivityScheduleRequest attendance = schedule(LocalDate.of(2026, 9, 23), LocalTime.of(9, 0), LocalTime.of(10, 0));
        attendance.setMemberIds(Set.of(member.getUserId(), secondMember.getUserId()));
        activityService.updateSchedule(pending.getId(), attendance, owner.getUserId());
        ActivityResponse group = activityService.updateSchedule(activityId,
                schedule(LocalDate.of(2026, 9, 23), LocalTime.of(9, 0), LocalTime.of(11, 0)), member.getUserId());
        assertThat(group.getMemberIds()).containsExactly(owner.getUserId());
        assertThat(activityService.get(pending.getId(), owner.getUserId()).getMemberIds())
                .containsExactlyInAnyOrder(member.getUserId(), secondMember.getUserId());
        activityService.updateSchedule(pending.getId(), schedule(null, null, null), member.getUserId());
        assertThat(activityService.get(activityId, member.getUserId()).getMemberIds())
                .containsExactlyInAnyOrder(owner.getUserId(), member.getUserId(), secondMember.getUserId());
    }

    @Test
    void returningAGroupActivityToTheTimelineDefaultsToAllMembers() {
        ActivityScheduleRequest custom = schedule(LocalDate.of(2026, 9, 23), LocalTime.of(8, 0), LocalTime.of(9, 0));
        custom.setMemberIds(Set.of(owner.getUserId()));
        activityService.updateSchedule(activityId, custom, owner.getUserId());
        activityService.updateSchedule(activityId, schedule(null, null, null), member.getUserId());
        assertThat(activityService.updateSchedule(activityId,
                schedule(LocalDate.of(2026, 9, 23), LocalTime.of(8, 0), LocalTime.of(9, 0)), member.getUserId()).getMemberIds())
                .containsExactlyInAnyOrder(owner.getUserId(), member.getUserId(), secondMember.getUserId());
    }

    @Test
    void alternativePlansMayBeScheduledWithNoMembers() {
        BranchActivityRequest request = branch(null, "Alternative", null, null);
        request.setDate(null);
        Long id = activityService.createBranch(trip.getTripId(), request, owner.getUserId()).getId();
        ActivityScheduleRequest attendance = schedule(LocalDate.of(2026, 9, 23), LocalTime.of(9, 0), LocalTime.of(10, 0));
        attendance.setMemberIds(Set.of());
        assertThat(activityService.updateSchedule(id, attendance, owner.getUserId()).getMemberIds()).isEmpty();
        ActivityScheduleRequest byMember = schedule(LocalDate.of(2026, 9, 23), LocalTime.of(11, 0), LocalTime.of(12, 0));
        activityService.updateSchedule(id, schedule(null, null, null), owner.getUserId());
        assertThat(activityService.updateSchedule(id, byMember, member.getUserId()).getMemberIds()).isEmpty();
    }

    @Test
    void invalidAlternativeAttendanceLeavesThePlanUnscheduledAndNormalMemberPermissionsUnchanged() {
        BranchActivityRequest request = branch(null, "Alternative", null, null);
        request.setDate(null);
        Long id = activityService.createBranch(trip.getTripId(), request, owner.getUserId()).getId();
        ActivityScheduleRequest attendance = schedule(LocalDate.of(2026, 9, 23), LocalTime.of(9, 0), LocalTime.of(10, 0));
        User outsider = user("Outside", "attendance-outside@example.test");
        attendance.setMemberIds(Set.of(outsider.getUserId()));
        assertThatThrownBy(() -> activityService.updateSchedule(id, attendance, owner.getUserId()))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("active member");
        ActivityResponse unchanged = activityService.get(id, member.getUserId());
        assertThat(unchanged.getDate()).isNull();
        assertThat(unchanged.getMemberIds()).isEmpty();
        attendance.setMemberIds(Set.of(member.getUserId()));
        assertThatThrownBy(() -> activityService.updateSchedule(activityId, attendance, member.getUserId()))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void unscheduledBranchStillRejectsPartialSchedules() {
        BranchActivityRequest dateOnly = branch(null, "Date only", null, null);
        assertThatThrownBy(() -> activityService.createBranch(trip.getTripId(), dateOnly, member.getUserId()))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("at least 10 minutes");
        BranchActivityRequest timesOnly = branch(null, "Times only", LocalTime.of(10, 0), LocalTime.of(11, 0));
        timesOnly.setDate(null);
        assertThatThrownBy(() -> activityService.createBranch(trip.getTripId(), timesOnly, member.getUserId()))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("unscheduled activity cannot have times");
    }

    @Test
    void branchMembersSkipOnlyTheGroupPlansTheirBranchOverlapsInTheBreakfastZooBridgeExample() {
        Long breakfast = approvedSchedule("Breakfast", LocalTime.of(7, 0), LocalTime.of(8, 0));
        activityService.updateSchedule(activityId,
                schedule(LocalDate.of(2026, 9, 23), LocalTime.of(9, 0), LocalTime.of(12, 0)), owner.getUserId());

        ActivityResponse bridge = activityService.createBranch(trip.getTripId(),
                branch(null, "Harbour Bridge", LocalTime.of(8, 15), LocalTime.of(11, 30)), member.getUserId());
        activityService.joinSchedule(bridge.getId(), secondMember.getUserId());

        assertThat(bridge.getStartTime()).isEqualTo(LocalTime.of(8, 15));
        assertThat(bridge.getEndTime()).isEqualTo(LocalTime.of(11, 30));
        assertThat(activityService.get(breakfast, owner.getUserId()).getMemberIds())
                .containsExactlyInAnyOrder(owner.getUserId(), member.getUserId(), secondMember.getUserId());
        ActivityResponse zoo = activityService.get(activityId, owner.getUserId());
        assertThat(zoo.getMemberIds()).containsExactly(owner.getUserId());
        assertThat(zoo.getStartTime()).isEqualTo(LocalTime.of(9, 0));
        assertThat(zoo.getEndTime()).isEqualTo(LocalTime.of(12, 0));
        assertThat(zoo.getApproveCount()).isEqualTo(2);
        assertThat(activityService.list(trip.getTripId(), secondMember.getUserId()))
                .extracting(ActivityResponse::getId).contains(breakfast, activityId, bridge.getId());
    }

    @Test
    void nonOverlappingOrAdjacentPlansAreAddedNormallyAndShortIntervalsAreRejected() {
        activityService.updateSchedule(activityId,
                schedule(LocalDate.of(2026, 9, 23), LocalTime.of(9, 0), LocalTime.of(12, 0)), owner.getUserId());
        ActivityResponse adjacent = activityService.createBranch(trip.getTripId(),
                branch(null, "Lunch", LocalTime.of(12, 0), LocalTime.of(12, 10)), member.getUserId());
        assertThat(adjacent.isBranch()).isTrue();
        assertThat(adjacent.isCanSchedule()).isFalse();
        assertThat(adjacent.getEndTime()).isEqualTo(LocalTime.of(12, 10));
        assertThat(activityService.get(activityId, owner.getUserId()).getMemberIds()).contains(member.getUserId());
        assertThat(activityService.updateSchedule(adjacent.getId(), schedule(null, null, null), member.getUserId())
                .isBranch()).isTrue();
        BranchActivityRequest selected = branch(null, "Lunch", LocalTime.of(11, 30), LocalTime.of(12, 10));
        selected.setMemberIds(Set.of(member.getUserId()));
        ActivityResponse edited = activityService.updateBranch(adjacent.getId(), selected, owner.getUserId());
        assertThat(activityService.get(activityId, owner.getUserId()).getMemberIds()).doesNotContain(member.getUserId());
        assertThatThrownBy(() -> activityService.vote(adjacent.getId(), VoteValue.APPROVE, owner.getUserId()))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("do not participate in voting");
        assertThatThrownBy(() -> activityService.createBranch(trip.getTripId(),
                branch(null, "Too short", LocalTime.of(9, 0), LocalTime.of(9, 9)), member.getUserId()))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("at least 10 minutes");
    }

    @Test
    void switchingUsesActualOverlapsAcrossMainActivitiesAndKeepsNonCollidingBranches() {
        activityService.updateSchedule(activityId,
                schedule(LocalDate.of(2026, 9, 23), LocalTime.of(9, 0), LocalTime.of(12, 0)), owner.getUserId());
        Long lunch = approvedSchedule("Lunch", LocalTime.of(12, 0), LocalTime.of(13, 0));
        ActivityResponse early = activityService.createBranch(trip.getTripId(),
                branch(null, "Early walk", LocalTime.of(9, 0), LocalTime.of(10, 0)), member.getUserId());
        ActivityResponse late = activityService.createBranch(trip.getTripId(),
                branch(null, "Late walk", LocalTime.of(11, 0), LocalTime.of(12, 30)), member.getUserId());
        assertThat(activityService.get(early.getId(), member.getUserId()).getMemberIds()).contains(member.getUserId());
        assertThat(activityService.get(lunch, member.getUserId()).getMemberIds()).doesNotContain(member.getUserId());

        activityService.joinSchedule(lunch, member.getUserId());
        assertThat(activityService.get(late.getId(), member.getUserId()).getMemberIds()).doesNotContain(member.getUserId());
        assertThat(activityService.get(early.getId(), member.getUserId()).getMemberIds()).contains(member.getUserId());
        assertThat(activityService.get(lunch, member.getUserId()).getMemberIds()).contains(member.getUserId());
        activityService.leaveSchedule(early.getId(), member.getUserId());
        assertThat(activityService.get(activityId, member.getUserId()).getMemberIds()).contains(member.getUserId());
    }

    @Test
    void aShortBranchBeforeAGroupPlanOnlySwitchesMembersOutOfTheBranchItOverlaps() {
        activityService.updateSchedule(activityId,
                schedule(LocalDate.of(2026, 9, 23), LocalTime.of(9, 0), LocalTime.of(12, 0)), owner.getUserId());
        ActivityResponse bridge = activityService.createBranch(trip.getTripId(),
                branch(null, "Bridge", LocalTime.of(8, 15), LocalTime.of(11, 30)), owner.getUserId());
        ActivityResponse coffee = activityService.createBranch(trip.getTripId(),
                branch(null, "Coffee", LocalTime.of(8, 20), LocalTime.of(8, 40)), member.getUserId());
        activityService.joinSchedule(coffee.getId(), owner.getUserId());
        assertThat(activityService.get(bridge.getId(), owner.getUserId()).getMemberIds()).doesNotContain(owner.getUserId());
        // Coffee finishes before the zoo: it must not take the member out of the zoo.
        assertThat(activityService.get(activityId, owner.getUserId()).getMemberIds()).contains(owner.getUserId());
        BranchActivityRequest edit = branch(null, "Coffee", LocalTime.of(8, 25), LocalTime.of(8, 45));
        assertThat(activityService.updateBranch(coffee.getId(), edit, member.getUserId()).getStartTime())
                .isEqualTo(LocalTime.of(8, 25));
    }

    @Test
    void editingABranchTimeMovesItsMembersOutOfWhateverItNowOverlaps() {
        activityService.updateSchedule(activityId,
                schedule(LocalDate.of(2026, 9, 23), LocalTime.of(9, 0), LocalTime.of(12, 0)), owner.getUserId());
        Long otherDay = approvedSchedule("Tomorrow's museum", LocalTime.of(13, 0), LocalTime.of(16, 0));
        activityService.updateSchedule(otherDay,
                schedule(LocalDate.of(2026, 9, 24), LocalTime.of(9, 0), LocalTime.of(12, 0)), owner.getUserId());
        ActivityResponse bridge = activityService.createBranch(trip.getTripId(),
                branch(null, "Bridge", LocalTime.of(8, 15), LocalTime.of(11, 30)), member.getUserId());
        BranchActivityRequest edit = branch(null, "Bridge", LocalTime.of(8, 15), LocalTime.of(11, 30));
        edit.setDate(LocalDate.of(2026, 9, 24));
        assertThat(activityService.updateBranch(bridge.getId(), edit, member.getUserId()).getDate())
                .isEqualTo(LocalDate.of(2026, 9, 24));
        assertThat(activityService.get(activityId, member.getUserId()).getMemberIds()).contains(member.getUserId());
        assertThat(activityService.get(otherDay, member.getUserId()).getMemberIds()).doesNotContain(member.getUserId());
        edit.setStartTime(LocalTime.of(18, 0)); edit.setEndTime(LocalTime.of(19, 0));
        assertThat(activityService.updateBranch(bridge.getId(), edit, member.getUserId()).getStartTime()).isEqualTo(LocalTime.of(18, 0));
        assertThat(activityService.get(otherDay, member.getUserId()).getMemberIds()).contains(member.getUserId());
    }

    @Test
    void otherTripsAndNonMembersCannotSupplyOrChangePlans() {
        activityService.updateSchedule(activityId,
                schedule(LocalDate.of(2026, 9, 23), LocalTime.of(9, 0), LocalTime.of(12, 0)), owner.getUserId());
        User outsider = user("Outsider", "outside@example.test");
        Trip other = trip("Other", "Sydney", trip.getStartDate(), trip.getEndDate());
        membership(other, outsider, "OWNER");
        Long foreignSource = activityService.create(other.getTripId(), activity("Private proposal"), outsider.getUserId()).getId();
        assertThatThrownBy(() -> activityService.createBranch(trip.getTripId(),
                branch(foreignSource, "Copy", LocalTime.of(9, 0), LocalTime.of(10, 0)), member.getUserId()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> activityService.createBranch(trip.getTripId(),
                branch(null, "Outside", LocalTime.of(9, 0), LocalTime.of(10, 0)), outsider.getUserId()))
                .isInstanceOf(RuntimeException.class);
        ActivityResponse branch = activityService.createBranch(trip.getTripId(),
                branch(null, "Bridge", LocalTime.of(9, 0), LocalTime.of(10, 0)), member.getUserId());
        assertThatThrownBy(() -> activityService.updateBranch(branch.getId(),
                branch(null, "Changed", LocalTime.of(10, 0), LocalTime.of(11, 0)), secondMember.getUserId()))
                .isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> activityService.joinSchedule(branch.getId(), outsider.getUserId()))
                .isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> activityService.updateSchedule(branch.getId(), schedule(null, null, null), outsider.getUserId()))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void concurrentSwitchesCannotLeaveAMemberInTwoOverlappingBranches() throws Exception {
        activityService.updateSchedule(activityId,
                schedule(LocalDate.of(2026, 9, 23), LocalTime.of(9, 0), LocalTime.of(12, 0)), owner.getUserId());
        ActivityResponse first = activityService.createBranch(trip.getTripId(),
                branch(null, "Aquarium", LocalTime.of(9, 0), LocalTime.of(10, 30)), owner.getUserId());
        ActivityResponse second = activityService.createBranch(trip.getTripId(),
                branch(null, "Bridge", LocalTime.of(10, 0), LocalTime.of(11, 30)), secondMember.getUserId());
        var executor = Executors.newFixedThreadPool(2);
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try {
            List<CompletableFuture<Void>> switches = List.of(first, second).stream().map(activity ->
                    CompletableFuture.runAsync(() -> {
                        ready.countDown();
                        try {
                            if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("Switch never started");
                        } catch (InterruptedException error) {
                            Thread.currentThread().interrupt(); throw new AssertionError(error);
                        }
                        activityService.joinSchedule(activity.getId(), member.getUserId());
                    }, executor)).toList();
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            CompletableFuture.allOf(switches.toArray(CompletableFuture[]::new)).get(10, TimeUnit.SECONDS);
            long joined = List.of(first, second).stream()
                    .filter(activity -> activityService.get(activity.getId(), member.getUserId()).getMemberIds().contains(member.getUserId()))
                    .count();
            assertThat(joined).isEqualTo(1);
            assertThat(activityService.get(activityId, member.getUserId()).getMemberIds()).doesNotContain(member.getUserId());
        } finally {
            start.countDown(); executor.shutdownNow();
        }
    }

    @Test
    void deletingOnePlanKeepsTheOtherAlternativesAndTheirMembershipRules() {
        activityService.updateSchedule(activityId,
                schedule(LocalDate.of(2026, 9, 23), LocalTime.of(9, 0), LocalTime.of(12, 0)), owner.getUserId());
        ActivityResponse bridge = activityService.createBranch(trip.getTripId(),
                branch(null, "Bridge", LocalTime.of(8, 15), LocalTime.of(11, 30)), member.getUserId());
        ActivityResponse coffee = activityService.createBranch(trip.getTripId(),
                branch(null, "Coffee", LocalTime.of(8, 20), LocalTime.of(8, 40)), secondMember.getUserId());
        activityService.delete(activityId, owner.getUserId());
        assertThat(activityRepository.existsById(activityId)).isFalse();
        assertThat(activityService.get(bridge.getId(), member.getUserId()).isBranch()).isTrue();
        assertThat(activityService.get(coffee.getId(), member.getUserId()).getName()).isEqualTo("Coffee");
        activityService.delete(coffee.getId(), secondMember.getUserId());
        assertThat(activityRepository.existsById(bridge.getId())).isTrue();
        assertThat(activityRepository.existsById(coffee.getId())).isFalse();
        assertThat(activityService.get(bridge.getId(), member.getUserId()).isCanSchedule()).isFalse();
    }

    private Long approvedSchedule(String name, LocalTime start, LocalTime end) {
        Long id = activityService.create(trip.getTripId(), activity(name), owner.getUserId()).getId();
        activityService.vote(id, VoteValue.APPROVE, owner.getUserId());
        activityService.vote(id, VoteValue.APPROVE, member.getUserId());
        activityService.updateSchedule(id, schedule(LocalDate.of(2026, 9, 23), start, end), owner.getUserId());
        return id;
    }

    private User user(String username, String email) {
        User user = new User(); user.setUsername(username); user.setEmail(email); user.setPasswordHash("hash");
        return userRepository.save(user);
    }

    private Trip trip(String name, String destination, LocalDate start, LocalDate end) {
        Trip value = new Trip(); value.setName(name); value.setDestination(destination); value.setStartDate(start);
        value.setEndDate(end); value.setPlannedBudget(BigDecimal.valueOf(1000)); value.setVotingThreshold(new BigDecimal("0.50"));
        return tripRepository.save(value);
    }

    private void membership(Trip value, User user, String role) {
        TripMember membership = new TripMember(); membership.setTrip(value); membership.setUser(user); membership.setRole(role);
        memberRepository.save(membership);
    }

    private CreateActivityRequest activity(String name) {
        CreateActivityRequest request = new CreateActivityRequest(); request.setName(name); request.setLocation("Ueno");
        request.setCategory("Culture"); request.setDescription("Main gallery visit"); return request;
    }

    private ActivityScheduleRequest schedule(LocalDate date, LocalTime start, LocalTime end) {
        ActivityScheduleRequest request = new ActivityScheduleRequest(); request.setDate(date); request.setStartTime(start); request.setEndTime(end);
        return request;
    }

    private BranchActivityRequest branch(Long sourceId, String name, LocalTime start, LocalTime end) {
        BranchActivityRequest request = new BranchActivityRequest();
        request.setSourceActivityId(sourceId); request.setName(name);
        request.setLocation("Sydney"); request.setCategory("Sightseeing"); request.setDescription("Alternative plan");
        request.setDate(LocalDate.of(2026, 9, 23)); request.setStartTime(start); request.setEndTime(end);
        return request;
    }
}
