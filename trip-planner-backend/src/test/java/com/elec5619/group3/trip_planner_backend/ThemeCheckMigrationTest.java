package com.elec5619.group3.trip_planner_backend;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ThemeCheckMigrationTest {
    @Test
    void theOldAccentCheckGoesAndOtherChecksOnUsersStay() throws Exception {
        String url = "jdbc:h2:mem:theme_check_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1";
        try (Connection connection = DriverManager.getConnection(url, "sa", "");
             Statement statement = connection.createStatement()) {
            statement.execute("""
                    CREATE TABLE users(user_id BIGINT PRIMARY KEY, role VARCHAR(20) CHECK (role IN ('USER','ADMIN')),
                        accent_color VARCHAR(20), CONSTRAINT users_chk_1 CHECK (accent_color IN ('BLUE','GREEN')))
                    """);
            statement.executeUpdate("INSERT INTO users VALUES (1, 'USER', 'GREEN')");
            assertThatThrownBy(() -> statement.executeUpdate("UPDATE users SET accent_color = 'AURORA'"));

            assertThat(Flyway.configure().dataSource(url, "sa", "").locations("classpath:db/migration")
                    .skipDefaultCallbacks(true).baselineOnMigrate(true).baselineVersion("5").target("6")
                    .load().migrate().migrationsExecuted).isEqualTo(1);

            statement.executeUpdate("UPDATE users SET accent_color = 'AURORA'");
            try (ResultSet row = statement.executeQuery("SELECT accent_color FROM users")) {
                row.next(); assertThat(row.getString(1)).isEqualTo("AURORA");
            }
            assertThatThrownBy(() -> statement.executeUpdate("UPDATE users SET role = 'ROOT'"));
        }
    }
}
