package com.elec5619.group3.trip_planner_backend;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class BranchRowMigrationTest {
    @Test
    void copiesMoveTheirTimeMembersCommentsAndExpensesBackToTheIdeaAndTheLinkColumnsGo() throws Exception {
        String url = databaseUrl();
        try (Connection connection = DriverManager.getConnection(url, "sa", "");
             Statement statement = connection.createStatement()) {
            createLegacyTables(statement);
            statement.executeUpdate("""
                    INSERT INTO activities(activity_id, trip_id, name, direct_scheduled_plan, date, start_time, end_time, ever_scheduled,
                        branch_parent_activity_id, source_activity_id) VALUES
                    (1, 1, 'Main plan', FALSE, '2026-09-23', '09:00', '12:00', TRUE, NULL, NULL),
                    (2, 1, 'Rejected idea', FALSE, NULL, NULL, NULL, FALSE, NULL, NULL),
                    (3, 1, 'Copy of rejected idea', TRUE, '2026-09-23', '10:00', '11:00', TRUE, 1, 2),
                    (4, 1, 'New branch', TRUE, '2026-09-23', '09:30', '10:30', TRUE, 1, NULL),
                    (5, 1, 'Second copy', TRUE, NULL, NULL, NULL, FALSE, NULL, 2),
                    (6, 1, 'Copy of a deleted idea', TRUE, NULL, NULL, NULL, FALSE, NULL, 99)
                    """);
            statement.executeUpdate("INSERT INTO activity_members VALUES (2, 10), (3, 11), (3, 12), (5, 13)");
            statement.executeUpdate("INSERT INTO activity_tags VALUES (3, 'copied'), (2, 'original')");
            statement.executeUpdate("INSERT INTO comments VALUES (1, 3, 'On the copy'), (2, 2, 'On the idea')");
            statement.executeUpdate("INSERT INTO expenses VALUES (1, 3), (2, NULL)");
            statement.executeUpdate("INSERT INTO votes VALUES (1, 2, 'REJECT')");

            assertThat(migrate(url)).isEqualTo(1);

            assertThat(ids(statement, "SELECT activity_id FROM activities ORDER BY activity_id")).containsExactly(1L, 2L, 4L, 6L);
            assertThat(ids(statement, "SELECT activity_id FROM activities WHERE direct_scheduled_plan = TRUE ORDER BY activity_id"))
                    .containsExactly(2L, 4L, 6L);
            try (ResultSet row = statement.executeQuery("SELECT date, start_time, end_time, ever_scheduled FROM activities WHERE activity_id = 2")) {
                row.next();
                assertThat(row.getString(1)).isEqualTo("2026-09-23");
                assertThat(row.getString(2)).startsWith("10:00");
                assertThat(row.getString(3)).startsWith("11:00");
                assertThat(row.getBoolean(4)).isTrue();
            }
            assertThat(ids(statement, "SELECT trip_member_id FROM activity_members WHERE activity_id = 2 ORDER BY trip_member_id")).containsExactly(11L, 12L);
            assertThat(ids(statement, "SELECT activity_id FROM comments ORDER BY comment_id")).containsExactly(2L, 2L);
            assertThat(ids(statement, "SELECT activity_id FROM expenses WHERE expense_id = 1")).containsExactly(2L);
            assertThat(ids(statement, "SELECT COUNT(*) FROM activity_tags WHERE activity_id = 3")).containsExactly(0L);
            assertThat(ids(statement, "SELECT COUNT(*) FROM votes WHERE activity_id = 2")).containsExactly(1L);
            assertThat(columnNames(connection)).doesNotContain("branch_parent_activity_id", "source_activity_id");
        }
    }

    @Test
    void freshDatabasesHaveNothingToMigrate() {
        String url = databaseUrl();
        // An empty database isn't baselined, so every migration runs (and finds no tables).
        assertThat(migrate(url)).isEqualTo(3);
        assertThat(migrate(url)).isZero();
    }

    private void createLegacyTables(Statement statement) throws Exception {
        statement.execute("""
                CREATE TABLE activities(activity_id BIGINT PRIMARY KEY, trip_id BIGINT NOT NULL, name VARCHAR(160),
                    direct_scheduled_plan BOOLEAN NOT NULL DEFAULT FALSE, date DATE, start_time TIME, end_time TIME,
                    ever_scheduled BOOLEAN NOT NULL DEFAULT FALSE, branch_parent_activity_id BIGINT, source_activity_id BIGINT,
                    CONSTRAINT fk_branch_parent FOREIGN KEY (branch_parent_activity_id) REFERENCES activities(activity_id))
                """);
        statement.execute("CREATE TABLE activity_members(activity_id BIGINT NOT NULL REFERENCES activities(activity_id), trip_member_id BIGINT NOT NULL)");
        statement.execute("CREATE TABLE activity_tags(activity_id BIGINT NOT NULL REFERENCES activities(activity_id), tag VARCHAR(40))");
        statement.execute("CREATE TABLE comments(comment_id BIGINT PRIMARY KEY, activity_id BIGINT NOT NULL REFERENCES activities(activity_id), content VARCHAR(200))");
        statement.execute("CREATE TABLE expenses(expense_id BIGINT PRIMARY KEY, activity_id BIGINT REFERENCES activities(activity_id))");
        statement.execute("CREATE TABLE votes(vote_id BIGINT PRIMARY KEY, activity_id BIGINT NOT NULL REFERENCES activities(activity_id), vote_value VARCHAR(10))");
    }

    private List<Long> ids(Statement statement, String sql) throws Exception {
        List<Long> ids = new ArrayList<>();
        try (ResultSet rows = statement.executeQuery(sql)) {
            while (rows.next()) ids.add(rows.getLong(1));
        }
        return ids;
    }

    private List<String> columnNames(Connection connection) throws Exception {
        List<String> names = new ArrayList<>();
        try (ResultSet rows = connection.getMetaData().getColumns(null, null, "ACTIVITIES", null)) {
            while (rows.next()) names.add(rows.getString("COLUMN_NAME").toLowerCase());
        }
        return names;
    }

    private int migrate(String url) {
        return Flyway.configure().dataSource(url, "sa", "").locations("classpath:db/migration")
                .skipDefaultCallbacks(true).baselineOnMigrate(true).baselineVersion("3").target("4")
                .load().migrate().migrationsExecuted;
    }

    private String databaseUrl() {
        return "jdbc:h2:mem:branch_rows_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1";
    }
}
