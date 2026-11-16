package com.elec5619.group3.trip_planner_backend;

import com.elec5619.group3.trip_planner_backend.entity.AccentColor;
import com.elec5619.group3.trip_planner_backend.entity.User;
import com.elec5619.group3.trip_planner_backend.repository.UserRepository;
import com.elec5619.group3.trip_planner_backend.util.JwtUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AccountPreferencesTest {
    private static final String PASSWORD = "Password123!";

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired JwtUtil jwtUtil;

    private User user;
    private String token;

    @BeforeEach
    void setUp() {
        user = new User();
        user.setUsername("traveller");
        user.setEmail(UUID.randomUUID() + "@example.test");
        user.setPasswordHash(passwordEncoder.encode(PASSWORD));
        user = users.save(user);
        token = "Bearer " + jwtUtil.generateToken(user.getUserId(), user.getEmail(), user.getRole());
    }

    @Test
    void usersWithoutAChoiceGetTheDefaultAccent() throws Exception {
        mvc.perform(get("/api/users/me").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accentColor").value("AURORA"));
    }

    @Test
    void savedAccentIsReturnedByProfileAndLogin() throws Exception {
        savePreference("{\"accentColor\":\"OCEAN\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accentColor").value("OCEAN"));

        assertThat(users.findById(user.getUserId())).get().extracting(User::getAccentColor).isEqualTo(AccentColor.OCEAN);
        mvc.perform(get("/api/users/me").header("Authorization", token))
                .andExpect(jsonPath("$.accentColor").value("OCEAN"));
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + user.getEmail() + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accentColor").value("OCEAN"));
    }

    @Test
    void unknownOrMissingAccentsAreRejected() throws Exception {
        savePreference("{\"accentColor\":\"NEON\"}").andExpect(status().isBadRequest());
        savePreference("{}").andExpect(status().isBadRequest());
        assertThat(users.findById(user.getUserId())).get().extracting(User::getAccentColor).isNull();
    }

    @Test
    void preferencesRequireSignIn() throws Exception {
        mvc.perform(put("/api/users/me/preferences").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"accentColor\":\"MIDNIGHT\"}"))
                .andExpect(status().isUnauthorized());
    }

    private ResultActions savePreference(String body) throws Exception {
        return mvc.perform(put("/api/users/me/preferences").header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }
}
