package com.elec5619.group3.trip_planner_backend;

import com.elec5619.group3.trip_planner_backend.entity.Trip;
import com.elec5619.group3.trip_planner_backend.entity.TripMember;
import com.elec5619.group3.trip_planner_backend.entity.User;
import com.elec5619.group3.trip_planner_backend.filter.AuthenticatedUser;
import com.elec5619.group3.trip_planner_backend.repository.TripMemberRepository;
import com.elec5619.group3.trip_planner_backend.repository.TripRepository;
import com.elec5619.group3.trip_planner_backend.repository.UserRepository;
import com.elec5619.group3.trip_planner_backend.util.JwtUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:admin-management;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminManagementTest {
    private static final String PASSWORD = "Password123!";

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired TripRepository trips;
    @Autowired TripMemberRepository members;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired JwtUtil jwtUtil;

    private User admin;
    private User traveller;
    private String tag;

    @BeforeEach
    void setUp() {
        tag = UUID.randomUUID().toString().substring(0, 8);
        admin = user("admin-" + tag, "ADMIN");
        traveller = user("traveller-" + tag, "USER");
    }

    @Test
    void usersAndTripsAreAdminOnlyAndSearchable() throws Exception {
        trip("Kyoto " + tag, traveller);

        mvc.perform(get("/api/admin/users").with(as(traveller, "USER"))).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/trips").with(as(traveller, "USER"))).andExpect(status().isForbidden());

        mvc.perform(get("/api/admin/users").param("query", "TRAVELLER-" + tag).with(as(admin, "ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.items[0].username").value("traveller-" + tag))
                .andExpect(jsonPath("$.items[0].disabled").value(false));

        mvc.perform(get("/api/admin/trips").param("query", "kyoto " + tag).with(as(admin, "ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.items[0].owner").value("traveller-" + tag))
                .andExpect(jsonPath("$.items[0].members[0].role").value("OWNER"));
    }

    @Test
    void disabledUsersCanNotLogInAndTheirTokensStopWorking() throws Exception {
        String token = jwtUtil.generateToken(traveller.getUserId(), traveller.getEmail(), traveller.getRole());
        mvc.perform(get("/api/trips").header("Authorization", "Bearer " + token)).andExpect(status().isOk());

        setDisabled(traveller, true).andExpect(status().isOk()).andExpect(jsonPath("$.disabled").value(true));

        mvc.perform(get("/api/trips").header("Authorization", "Bearer " + token)).andExpect(status().isUnauthorized());
        login(traveller).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("This account has been disabled. Please contact the administrator."));

        setDisabled(traveller, false).andExpect(status().isOk());
        mvc.perform(get("/api/trips").header("Authorization", "Bearer " + token)).andExpect(status().isOk());
        login(traveller).andExpect(status().isOk());
    }

    @Test
    void administratorAccountsCanNotBeDisabled() throws Exception {
        User otherAdmin = user("admin2-" + tag, "ADMIN");
        setDisabled(otherAdmin, true).andExpect(status().isBadRequest());
        setDisabled(admin, true).andExpect(status().isBadRequest());
        assertThat(users.findById(otherAdmin.getUserId())).get().extracting(User::isDisabled).isEqualTo(false);
    }

    @Test
    void adminsCanDeleteTripsTheyAreNotMembersOf() throws Exception {
        Trip trip = trip("Osaka " + tag, traveller);

        mvc.perform(delete("/api/admin/trips/{id}", trip.getTripId()).with(as(admin, "ADMIN")))
                .andExpect(status().isNoContent());

        assertThat(trips.findById(trip.getTripId())).isEmpty();
        assertThat(members.findByTrip_TripId(trip.getTripId())).isEmpty();
        mvc.perform(delete("/api/admin/trips/{id}", trip.getTripId()).with(as(admin, "ADMIN")))
                .andExpect(status().isNotFound());
    }

    @Test
    void connectionTestsRejectUnknownServicesAndUnsafeModels() throws Exception {
        mvc.perform(post("/api/admin/services/currency/test").with(as(admin, "ADMIN")))
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/admin/services/ai/test").param("model", "../x?key=1").with(as(admin, "ADMIN")))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/admin/services/ai/test").with(as(traveller, "USER")))
                .andExpect(status().isForbidden());
    }

    private org.springframework.test.web.servlet.ResultActions setDisabled(User user, boolean disabled) throws Exception {
        return mvc.perform(put("/api/admin/users/{id}/status", user.getUserId()).with(as(admin, "ADMIN"))
                .contentType(MediaType.APPLICATION_JSON).content("{\"disabled\":" + disabled + "}"));
    }

    private org.springframework.test.web.servlet.ResultActions login(User user) throws Exception {
        return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + user.getEmail() + "\",\"password\":\"" + PASSWORD + "\"}"));
    }

    private User user(String username, String role) {
        User user = new User();
        user.setUsername(username);
        user.setEmail(username + "@example.test");
        user.setPasswordHash(passwordEncoder.encode(PASSWORD));
        user.setRole(role);
        return users.save(user);
    }

    private Trip trip(String name, User owner) {
        Trip trip = new Trip();
        trip.setName(name);
        trip.setDestination("Japan");
        trip.setStartDate(LocalDate.of(2026, 11, 1));
        trip.setEndDate(LocalDate.of(2026, 11, 5));
        trip.setPlannedBudget(BigDecimal.valueOf(1000));
        trip = trips.save(trip);
        TripMember membership = new TripMember();
        membership.setTrip(trip);
        membership.setUser(owner);
        membership.setRole("OWNER");
        members.save(membership);
        return trip;
    }

    private RequestPostProcessor as(User user, String role) {
        return authentication(new UsernamePasswordAuthenticationToken(new AuthenticatedUser(user.getUserId(), user.getEmail()),
                null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }
}
