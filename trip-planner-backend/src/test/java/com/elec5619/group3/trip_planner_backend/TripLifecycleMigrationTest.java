package com.elec5619.group3.trip_planner_backend;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class TripLifecycleMigrationTest {

    @Test
    void completedTripsBecomeArchivedAndEveryoneStartsOnTheDefaultTheme() throws Exception {
        String url = databaseUrl();
        try (Connection connection = DriverManager.getConnection(url, "sa", "");
             Statement statement = connection.createStatement()) {
            statement.execute("CREATE TABLE trips(trip_id BIGINT PRIMARY KEY, status VARCHAR(20))");
            statement.execute("CREATE TABLE users(user_id BIGINT PRIMARY KEY, accent_color VARCHAR(20))");
            statement.executeUpdate("INSERT INTO trips VALUES (1, 'PLANNING'), (2, 'ONGOING'), (3, 'COMPLETED')");
            statement.executeUpdate("INSERT INTO users VALUES (1, 'SAGE'), (2, NULL)");

            migrate(url);

            assertThat(column(statement, "SELECT status FROM trips ORDER BY trip_id")).containsExactly("PLANNING", "ONGOING", "ARCHIVED");
            assertThat(column(statement, "SELECT accent_color FROM users ORDER BY user_id")).containsExactly(null, null);
        }
    }

    @Test
    void freshDatabasesMigrateBeforeHibernateCreatesTheirTables() {
        String url = databaseUrl();
        assertThat(migrate(url)).isEqualTo(5);
        assertThat(migrate(url)).isZero();
    }

    private List<String> column(Statement statement, String query) throws Exception {
        List<String> values = new ArrayList<>();
        try (var rows = statement.executeQuery(query)) {
            while (rows.next()) values.add(rows.getString(1));
        }
        return values;
    }

    private int migrate(String url) {
        return Flyway.configure().dataSource(url, "sa", "").locations("classpath:db/migration")
                .skipDefaultCallbacks(true).baselineOnMigrate(true).baselineVersion("1")
                .load().migrate().migrationsExecuted;
    }

    private String databaseUrl() {
        return "jdbc:h2:mem:lifecycle_migration_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1";
    }
}
