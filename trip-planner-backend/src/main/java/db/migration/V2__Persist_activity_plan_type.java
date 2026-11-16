package db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;

public class V2__Persist_activity_plan_type extends BaseJavaMigration {
    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();
        boolean activitiesExist = false;
        boolean markerExists = false;
        try (ResultSet columns = connection.getMetaData().getColumns(connection.getCatalog(), null, null, null)) {
            while (columns.next()) {
                if (!"activities".equalsIgnoreCase(columns.getString("TABLE_NAME"))) continue;
                activitiesExist = true;
                if ("direct_scheduled_plan".equalsIgnoreCase(columns.getString("COLUMN_NAME"))) markerExists = true;
            }
        }
        // On an empty database Hibernate creates the table and its false default after Flyway.
        if (!activitiesExist) return;
        try (Statement statement = connection.createStatement()) {
            if (!markerExists) {
                statement.execute("ALTER TABLE activities ADD COLUMN direct_scheduled_plan BOOLEAN NOT NULL DEFAULT FALSE");
            }
            statement.executeUpdate("""
                    UPDATE activities SET direct_scheduled_plan = TRUE
                    WHERE branch_parent_activity_id IS NOT NULL OR source_activity_id IS NOT NULL
                       OR EXISTS (SELECT 1 FROM update_history h
                           WHERE h.trip_id = activities.trip_id AND h.change_type = 'BRANCH_CREATED'
                             AND (h.description LIKE CONCAT('Added scheduled plan #', activities.activity_id, ':%')
                               OR h.description LIKE CONCAT('Created branch #', activities.activity_id, ' for activity #%')))
                    """);
        }
    }
}
