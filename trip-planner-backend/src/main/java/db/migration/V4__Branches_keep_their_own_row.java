package db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Turning an idea into a branch used to copy it into a new activity (source_activity_id) and attach every branch to an
 * overlapping plan (branch_parent_activity_id). A branch is now the idea itself, so each copy's time and members move
 * back onto its idea, the copy is removed, and both columns go.
 */
public class V4__Branches_keep_their_own_row extends BaseJavaMigration {
    private record Ref(String table, String column) {}

    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();
        DatabaseMetaData meta = connection.getMetaData();
        String activities = tableName(meta, connection, "activities");
        // On an empty database Hibernate creates the table afterwards, without either column.
        if (activities == null) return;
        Set<String> columns = columns(meta, connection, activities);
        if (columns.contains("source_activity_id")) mergeCopies(connection, meta, activities, columns);
        if (columns.contains("branch_parent_activity_id")) dropColumn(connection, meta, activities, "branch_parent_activity_id");
        if (columns.contains("source_activity_id")) dropColumn(connection, meta, activities, "source_activity_id");
    }

    private void mergeCopies(Connection connection, DatabaseMetaData meta, String activities, Set<String> columns) throws SQLException {
        List<long[]> copies = new ArrayList<>();
        try (Statement statement = connection.createStatement();
             ResultSet rows = statement.executeQuery("SELECT c.activity_id, c.source_activity_id FROM activities c"
                     + " JOIN activities s ON s.activity_id = c.source_activity_id AND s.trip_id = c.trip_id"
                     + " WHERE s.direct_scheduled_plan = FALSE")) {
            while (rows.next()) copies.add(new long[] {rows.getLong(1), rows.getLong(2)});
        }
        if (copies.isEmpty()) return;
        List<Ref> refs = new ArrayList<>();
        try (ResultSet rows = meta.getExportedKeys(connection.getCatalog(), null, activities)) {
            while (rows.next()) refs.add(new Ref(rows.getString("FKTABLE_NAME"), rows.getString("FKCOLUMN_NAME")));
        }
        boolean ever = columns.contains("ever_scheduled");
        Set<Long> sources = new HashSet<>();
        for (long[] pair : copies) {
            long copy = pair[0], source = pair[1];
            // Two copies of one idea: the first one decides the idea's time.
            if (!sources.add(source)) { deleteActivity(connection, refs, copy, source, false); continue; }
            // MySQL can't read the table it updates in a subquery, so the copy's values are read first.
            Object[] values;
            try (PreparedStatement read = connection.prepareStatement("SELECT date, start_time, end_time"
                    + (ever ? ", ever_scheduled" : "") + " FROM activities WHERE activity_id = ?")) {
                read.setLong(1, copy);
                try (ResultSet row = read.executeQuery()) {
                    row.next();
                    values = new Object[] {row.getObject(1), row.getObject(2), row.getObject(3), ever ? row.getObject(4) : null};
                }
            }
            try (PreparedStatement update = connection.prepareStatement("UPDATE activities SET direct_scheduled_plan = TRUE,"
                    + " date = ?, start_time = ?, end_time = ?" + (ever ? ", ever_scheduled = ?" : "") + " WHERE activity_id = ?")) {
                int i = 1;
                for (int k = 0; k < (ever ? 4 : 3); k++) update.setObject(i++, values[k]);
                update.setLong(i, source);
                update.executeUpdate();
            }
            deleteActivity(connection, refs, copy, source, true);
        }
    }

    /** Removes a copy: its members, expenses and comments move to the idea; anything else it owned goes with it. */
    private void deleteActivity(Connection connection, List<Ref> refs, long copy, long source, boolean keepMembers) throws SQLException {
        for (Ref ref : refs) {
            String table = ref.table().toLowerCase(), column = ref.column();
            if (table.equals("activities")) {
                execute(connection, "UPDATE " + ref.table() + " SET " + column + " = NULL WHERE " + column + " = ?", copy);
            } else if (table.equals("activity_members") && keepMembers) {
                execute(connection, "DELETE FROM " + ref.table() + " WHERE " + column + " = ?", source);
                execute(connection, "UPDATE " + ref.table() + " SET " + column + " = ? WHERE " + column + " = ?", source, copy);
            } else if (table.equals("expenses") || table.equals("comments")) {
                execute(connection, "UPDATE " + ref.table() + " SET " + column + " = ? WHERE " + column + " = ?", source, copy);
            } else {
                execute(connection, "DELETE FROM " + ref.table() + " WHERE " + column + " = ?", copy);
            }
        }
        execute(connection, "DELETE FROM activities WHERE activity_id = ?", copy);
    }

    private void dropColumn(Connection connection, DatabaseMetaData meta, String activities, String column) throws SQLException {
        List<String> keys = new ArrayList<>();
        try (ResultSet rows = meta.getImportedKeys(connection.getCatalog(), null, activities)) {
            while (rows.next()) if (column.equalsIgnoreCase(rows.getString("FKCOLUMN_NAME"))) keys.add(rows.getString("FK_NAME"));
        }
        boolean mysql = meta.getDatabaseProductName().toLowerCase().contains("mysql");
        try (Statement statement = connection.createStatement()) {
            for (String key : keys) {
                statement.execute("ALTER TABLE activities DROP " + (mysql ? "FOREIGN KEY " : "CONSTRAINT ") + key);
            }
            statement.execute("ALTER TABLE activities DROP COLUMN " + column);
        }
    }

    private void execute(Connection connection, String sql, long... values) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            for (int i = 0; i < values.length; i++) statement.setLong(i + 1, values[i]);
            statement.executeUpdate();
        }
    }

    private String tableName(DatabaseMetaData meta, Connection connection, String name) throws SQLException {
        try (ResultSet rows = meta.getTables(connection.getCatalog(), connection.getSchema(), null, new String[] {"TABLE"})) {
            while (rows.next()) if (name.equalsIgnoreCase(rows.getString("TABLE_NAME"))) return rows.getString("TABLE_NAME");
        }
        return null;
    }

    private Set<String> columns(DatabaseMetaData meta, Connection connection, String table) throws SQLException {
        Set<String> names = new HashSet<>();
        try (ResultSet rows = meta.getColumns(connection.getCatalog(), connection.getSchema(), table, null)) {
            while (rows.next()) names.add(rows.getString("COLUMN_NAME").toLowerCase());
        }
        return names;
    }
}
