package db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

/**
 * When users was first created, Hibernate added a CHECK constraint that only allows the old accent names in
 * accent_color, so saving any current theme failed (ErrorCode 3819, "users_chk_1 is violated"). V5 fixed the column
 * type but not this constraint. Only checks on accent_color go; others on the table (such as role) stay.
 */
public class V6__Drop_old_theme_check extends BaseJavaMigration {
    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();
        boolean mysql = connection.getMetaData().getDatabaseProductName().toLowerCase().contains("mysql");
        String schema = mysql ? connection.getCatalog() : connection.getSchema();
        List<String> checks = new ArrayList<>();
        try (PreparedStatement query = connection.prepareStatement("""
                SELECT tc.CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                JOIN INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc
                  ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
                WHERE tc.TABLE_SCHEMA = ? AND LOWER(tc.TABLE_NAME) = 'users' AND tc.CONSTRAINT_TYPE = 'CHECK'
                  AND LOWER(cc.CHECK_CLAUSE) LIKE '%accent_color%'
                """)) {
            query.setString(1, schema);
            try (ResultSet rows = query.executeQuery()) {
                while (rows.next()) checks.add(rows.getString(1));
            }
        }
        try (Statement statement = connection.createStatement()) {
            for (String check : checks) {
                statement.execute("ALTER TABLE users DROP " + (mysql ? "CHECK `" + check + "`" : "CONSTRAINT \"" + check + "\""));
            }
        }
    }
}
