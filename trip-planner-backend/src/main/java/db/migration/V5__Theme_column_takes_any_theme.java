package db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.Statement;

/**
 * users.accent_color was created as a MySQL ENUM of the old accent names, so saving any of the new themes failed
 * (and the theme fell back to the default on the next load). It becomes a plain VARCHAR; the converter already
 * turns names this version doesn't know into the default theme.
 */
public class V5__Theme_column_takes_any_theme extends BaseJavaMigration {
    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();
        DatabaseMetaData meta = connection.getMetaData();
        String type = null;
        try (ResultSet rows = meta.getColumns(connection.getCatalog(), connection.getSchema(), null, null)) {
            while (rows.next()) {
                if ("users".equalsIgnoreCase(rows.getString("TABLE_NAME")) && "accent_color".equalsIgnoreCase(rows.getString("COLUMN_NAME"))) {
                    type = rows.getString("TYPE_NAME");
                }
            }
        }
        // On an empty database Hibernate creates the column afterwards, already as VARCHAR.
        if (type == null || type.toUpperCase().contains("CHAR")) return;
        boolean mysql = meta.getDatabaseProductName().toLowerCase().contains("mysql");
        try (Statement statement = connection.createStatement()) {
            statement.execute(mysql ? "ALTER TABLE users MODIFY accent_color VARCHAR(20) NULL"
                    : "ALTER TABLE users ALTER COLUMN accent_color VARCHAR(20) NULL");
        }
    }
}
