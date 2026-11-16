package com.elec5619.group3.trip_planner_backend;

import com.elec5619.group3.trip_planner_backend.entity.User;
import com.elec5619.group3.trip_planner_backend.repository.UserRepository;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.Date;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.emptyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * FR-1: registration, login, and JWT-protected endpoints, tested through real HTTP requests
 * (MockMvc) against the full application with an in-memory H2 database.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthenticationTest {
    private static final String PASSWORD = "Password123!";

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder passwordEncoder;
    @Value("${jwt.secret}") String jwtSecret;

    // ---- Registration ----

    @Test
    void registeringCreatesAnAccountWithAHashedPasswordAndReturnsAToken() throws Exception {
        String email = uniqueEmail();

        register("traveller", email, PASSWORD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token", not(emptyString())))
                .andExpect(jsonPath("$.username").value("traveller"))
                .andExpect(jsonPath("$.email").value(email))
                .andExpect(jsonPath("$.role").value("USER"));

        User saved = users.findByEmail(email).orElseThrow();
        assertThat(saved.getPasswordHash()).isNotEqualTo(PASSWORD);
        assertThat(passwordEncoder.matches(PASSWORD, saved.getPasswordHash())).isTrue();
    }

    @Test
    void anEmailCanOnlyBeRegisteredOnce() throws Exception {
        String email = uniqueEmail();
        register("first", email, PASSWORD).andExpect(status().isOk());

        register("second", email, PASSWORD)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Email is already registered"));
        assertThat(users.findByEmail(email)).get().extracting(User::getUsername).isEqualTo("first");
    }

    // Each row is one invalid registration: username, email, password, the error we expect.
    @ParameterizedTest
    @CsvSource({
            "'',        valid@example.test, Password123!, 'username: Username is required'",
            "traveller, not-an-email,       Password123!, 'email: Email must be valid'",
            "traveller, valid@example.test, short,        'password: Password must be between 8 and 72 characters'",
    })
    void invalidRegistrationsAreRejectedWithTheReason(String username, String email, String password,
                                                      String expectedError) throws Exception {
        register(username, email, password)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString(expectedError)));
        assertThat(users.findByEmail(email)).isEmpty();
    }

    // ---- Login ----

    @Test
    void loggingInReturnsATokenThatOpensProtectedEndpoints() throws Exception {
        String email = uniqueEmail();
        register("traveller", email, PASSWORD).andExpect(status().isOk());

        String body = login(email, PASSWORD)
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String token = body.replaceAll(".*\"token\":\"([^\"]+)\".*", "$1");

        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(email));
    }

    @Test
    void aWrongPasswordAndAnUnknownEmailGetTheSameAnswer() throws Exception {
        String email = uniqueEmail();
        register("traveller", email, PASSWORD).andExpect(status().isOk());

        // Same status and message for both, so the login form can't be used to find out who has an account.
        login(email, "WrongPassword1!")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid email or password"));
        login(uniqueEmail(), PASSWORD)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid email or password"));
    }

    // ---- Protected endpoints ----

    @Test
    void protectedEndpointsRequireAToken() throws Exception {
        mvc.perform(get("/api/users/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Authentication is required to access this resource"));
    }

    @Test
    void aTamperedTokenIsRejected() throws Exception {
        String email = uniqueEmail();
        String token = tokenFor(register("traveller", email, PASSWORD));
        // Changing one character of the signature makes it no longer match the server's secret.
        String last = token.substring(token.length() - 1);
        String tampered = token.substring(0, token.length() - 1) + ("A".equals(last) ? "B" : "A");

        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + tampered))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void anExpiredTokenIsRejected() throws Exception {
        String email = uniqueEmail();
        register("traveller", email, PASSWORD).andExpect(status().isOk());
        User user = users.findByEmail(email).orElseThrow();
        // Correctly signed with the real test secret, but it expired a minute ago.
        String expired = Jwts.builder()
                .subject(email)
                .claim("userId", user.getUserId())
                .claim("role", user.getRole())
                .issuedAt(new Date(System.currentTimeMillis() - 120_000))
                .expiration(new Date(System.currentTimeMillis() - 60_000))
                .signWith(Keys.hmacShaKeyFor(jwtSecret.getBytes()))
                .compact();

        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + expired))
                .andExpect(status().isUnauthorized());
    }

    // The admin tests set the role directly; this one checks a real token's role claim is what decides.
    @Test
    void aTokensRoleDecidesAdminAccess() throws Exception {
        String userToken = tokenFor(register("traveller", uniqueEmail(), PASSWORD));
        String adminEmail = uniqueEmail();
        register("manager", adminEmail, PASSWORD).andExpect(status().isOk());
        User admin = users.findByEmail(adminEmail).orElseThrow();
        admin.setRole("ADMIN");
        users.save(admin);
        String adminToken = tokenFor(login(adminEmail, PASSWORD));

        mvc.perform(get("/api/admin/services").header("Authorization", "Bearer " + userToken))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/services").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk());
    }

    // ---- Helpers ----

    private ResultActions register(String username, String email, String password) throws Exception {
        return mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"username":"%s","email":"%s","password":"%s"}""".formatted(username, email, password)));
    }

    private ResultActions login(String email, String password) throws Exception {
        return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"email":"%s","password":"%s"}""".formatted(email, password)));
    }

    private static String tokenFor(ResultActions registration) throws Exception {
        String body = registration.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return body.replaceAll(".*\"token\":\"([^\"]+)\".*", "$1");
    }

    // The test database is shared by every test in this class, so each test uses its own email.
    private static String uniqueEmail() {
        return UUID.randomUUID() + "@example.test";
    }
}
