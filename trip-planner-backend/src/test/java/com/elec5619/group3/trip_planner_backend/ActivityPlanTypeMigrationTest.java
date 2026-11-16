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

class ActivityPlanTypeMigrationTest {
    @Test
    void backfillsLinkedAndBothHistoricalBranchFormatsWithoutChangingMainActivitiesOrHistory() throws Exception {
        String url = databaseUrl();
        try (Connection connection = DriverManager.getConnection(url, "sa", "");
             Statement statement = connection.createStatement()) {
            createLegacyTables(statement);
            statement.executeUpdate("""
                    INSERT INTO activities VALUES
                    (1, 1, 'Main', NULL, NULL), (2, 1, 'Source copy', NULL, 1),
                    (3, 1, 'Linked branch', 1, NULL), (4, 1, 'New history', NULL, NULL),
                    (5, 1, 'Legacy history', NULL, NULL), (6, 1, 'Wrong trip', NULL, NULL),
                    (7, 1, 'Wrong type', NULL, NULL), (12, 1, 'Exact ID', NULL, NULL)
                    """);
            statement.executeUpdate("""
                    INSERT INTO update_history VALUES
                    (1, 'BRANCH_CREATED', 'Added scheduled plan #4: New history'),
                    (1, 'BRANCH_CREATED', 'Created branch #5 for activity #1'),
                    (2, 'BRANCH_CREATED', 'Added scheduled plan #6: Wrong trip'),
                    (1, 'ACTIVITY_SCHEDULED', 'Added scheduled plan #7: Wrong type'),
                    (1, 'BRANCH_CREATED', 'Added scheduled plan #12: Exact ID')
                    """);

            assertThat(migrate(url)).isEqualTo(1);
            assertThat(alternativeIds(statement)).containsExactly(2L, 3L, 4L, 5L, 12L);
            try (var rows = statement.executeQuery("SELECT COUNT(*) FROM update_history")) {
                rows.next(); assertThat(rows.getInt(1)).isEqualTo(5);
            }
            try (var rows = statement.executeQuery("SELECT COUNT(*) FROM activities")) {
                rows.next(); assertThat(rows.getInt(1)).isEqualTo(8);
            }
            statement.executeUpdate("DELETE FROM update_history");
            assertThat(migrate(url)).isZero();
            assertThat(alternativeIds(statement)).containsExactly(2L, 3L, 4L, 5L, 12L);
            statement.executeUpdate("INSERT INTO activities(activity_id, trip_id, name) VALUES (13, 1, 'New main')");
            assertThat(alternativeIds(statement)).doesNotContain(13L);
        }
    }

    @Test
    void preservesExistingExplicitMarkersAndBackfillsWhenHibernateAlreadyAddedTheColumn() throws Exception {
        String url = databaseUrl();
        try (Connection connection = DriverManager.getConnection(url, "sa", "");
             Statement statement = connection.createStatement()) {
            createLegacyTables(statement);
            statement.execute("ALTER TABLE activities ADD COLUMN direct_scheduled_plan BOOLEAN NOT NULL DEFAULT FALSE");
            statement.executeUpdate("""
                    INSERT INTO activities VALUES
                    (1, 1, 'Explicit alternative', NULL, NULL, TRUE),
                    (2, 1, 'Source copy', NULL, 3, FALSE), (3, 1, 'Main', NULL, NULL, FALSE)
                    """);
            assertThat(migrate(url)).isEqualTo(1);
            assertThat(alternativeIds(statement)).containsExactly(1L, 2L);
        }
    }

    @Test
    void freshDatabasesCanMigrateBeforeHibernateCreatesTheirTables() {
        String url = databaseUrl();
        assertThat(migrate(url)).isEqualTo(1);
        assertThat(migrate(url)).isZero();
    }

    private void createLegacyTables(Statement statement) throws Exception {
        statement.execute("""
                CREATE TABLE activities(activity_id BIGINT PRIMARY KEY, trip_id BIGINT NOT NULL, name VARCHAR(160),
                    branch_parent_activity_id BIGINT, source_activity_id BIGINT)
                """);
        statement.execute("CREATE TABLE update_history(trip_id BIGINT, change_type VARCHAR(80), description VARCHAR(2000))");
    }

    private List<Long> alternativeIds(Statement statement) throws Exception {
        List<Long> ids = new ArrayList<>();
        try (var rows = statement.executeQuery("SELECT activity_id FROM activities WHERE direct_scheduled_plan = TRUE ORDER BY activity_id")) {
            while (rows.next()) ids.add(rows.getLong(1));
        }
        return ids;
    }

    private int migrate(String url) {
        return Flyway.configure().dataSource(url, "sa", "").locations("classpath:db/migration")
                .skipDefaultCallbacks(true).baselineOnMigrate(true).baselineVersion("1").target("2")
                .load().migrate().migrationsExecuted;
    }

    private String databaseUrl() {
        return "jdbc:h2:mem:branch_migration_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1";
    }
}
