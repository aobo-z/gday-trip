package db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.HashSet;
import java.util.Set;

/**
 * The trip lifecycle is now PLANNING -> ONGOING -> ARCHIVED -> PUBLISHED; the old COMPLETED came from
 * archiving, so it becomes ARCHIVED. Themes replaced the old accents, so everyone starts on the default.
 */
public class V3__Trip_lifecycle_and_themes extends BaseJavaMigration {
    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();
        Set<String> tables = new HashSet<>();
        try (ResultSet rows = connection.getMetaData().getTables(connection.getCatalog(), connection.getSchema(), null, new String[] {"TABLE"})) {
            while (rows.next()) tables.add(rows.getString("TABLE_NAME").toLowerCase());
        }
        // On an empty database Hibernate creates the tables after Flyway, so there is nothing to convert.
        try (Statement statement = connection.createStatement()) {
            if (tables.contains("trips")) {
                statement.executeUpdate("UPDATE trips SET status = 'ARCHIVED' WHERE status = 'COMPLETED'");
            }
            if (tables.contains("users")) {
                statement.executeUpdate("UPDATE users SET accent_color = NULL");
            }
        }
    }
}
