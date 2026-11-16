package com.elec5619.group3.trip_planner_backend;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** FR-21: a signed-in user manages only their own account. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AccountManagementTest {
    private static final String PASSWORD = "Password123!";

    @Autowired MockMvc mvc;

    @Test
    void aTokenOnlyReachesItsOwnAccount() throws Exception {
        String alice = register("alice", uniqueEmail());
        String bob = register("bob", uniqueEmail());

        mvc.perform(put("/api/users/me").header("Authorization", alice).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"alice2\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("alice2"));

        mvc.perform(get("/api/users/me").header("Authorization", bob))
                .andExpect(jsonPath("$.username").value("bob"));
    }

    @Test
    void changingPasswordRequiresTheCurrentPassword() throws Exception {
        String email = uniqueEmail();
        String token = register("traveller", email);

        changePassword(token, "WrongPassword1!", "NewPassword456!").andExpect(status().isBadRequest());
        login(email, PASSWORD).andExpect(status().isOk());

        changePassword(token, PASSWORD, "NewPassword456!").andExpect(status().isOk());
        login(email, "NewPassword456!").andExpect(status().isOk());
        login(email, PASSWORD).andExpect(status().isUnauthorized());
    }

    @Test
    void changingEmailMovesTheLogin() throws Exception {
        String oldEmail = uniqueEmail();
        String newEmail = uniqueEmail();
        String takenEmail = uniqueEmail();
        String token = register("traveller", oldEmail);
        register("someone", takenEmail);

        changeEmail(token, takenEmail)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Email is already registered"));

        changeEmail(token, newEmail).andExpect(status().isOk()).andExpect(jsonPath("$.email").value(newEmail));
        login(newEmail, PASSWORD).andExpect(status().isOk());
        login(oldEmail, PASSWORD).andExpect(status().isUnauthorized());
    }

    /** Registers a user and returns an Authorization header value for them. */
    private String register(String username, String email) throws Exception {
        String body = mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"%s","email":"%s","password":"%s"}""".formatted(username, email, PASSWORD)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return "Bearer " + body.replaceAll(".*\"token\":\"([^\"]+)\".*", "$1");
    }

    private ResultActions login(String email, String password) throws Exception {
        return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"email":"%s","password":"%s"}""".formatted(email, password)));
    }

    private ResultActions changePassword(String token, String current, String next) throws Exception {
        return mvc.perform(put("/api/users/me/password").header("Authorization", token).contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"currentPassword":"%s","newPassword":"%s"}""".formatted(current, next)));
    }

    private ResultActions changeEmail(String token, String newEmail) throws Exception {
        return mvc.perform(put("/api/users/me/email").header("Authorization", token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"newEmail\":\"" + newEmail + "\"}"));
    }

    private static String uniqueEmail() {
        return UUID.randomUUID() + "@example.test";
    }
}
