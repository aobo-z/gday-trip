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

class ThemeColumnMigrationTest {
    @Test
    void anOldAccentEnumColumnAcceptsTheNewThemesAfterwardsAndKeepsItsValues() throws Exception {
        String url = "jdbc:h2:mem:theme_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1";
        try (Connection connection = DriverManager.getConnection(url, "sa", "");
             Statement statement = connection.createStatement()) {
            statement.execute("CREATE TABLE users(user_id BIGINT PRIMARY KEY, accent_color ENUM('BLUE','GREEN'))");
            statement.executeUpdate("INSERT INTO users VALUES (1, 'GREEN'), (2, NULL)");
            assertThatThrownBy(() -> statement.executeUpdate("UPDATE users SET accent_color = 'AURORA' WHERE user_id = 2"));

            assertThat(Flyway.configure().dataSource(url, "sa", "").locations("classpath:db/migration")
                    .skipDefaultCallbacks(true).baselineOnMigrate(true).baselineVersion("4").target("5")
                    .load().migrate().migrationsExecuted).isEqualTo(1);

            statement.executeUpdate("UPDATE users SET accent_color = 'AURORA' WHERE user_id = 2");
            try (ResultSet rows = statement.executeQuery("SELECT accent_color FROM users ORDER BY user_id")) {
                rows.next(); assertThat(rows.getString(1)).isEqualTo("GREEN");
                rows.next(); assertThat(rows.getString(1)).isEqualTo("AURORA");
            }
        }
    }
}
