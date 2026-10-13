package com.vcreativestudio.sportstage.releaseinspection;

import android.app.Activity;
import android.app.Application;
import android.app.Instrumentation;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.os.Bundle;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;

/** Test-only, read-only inspection of a signed app. Never bundled into the app. */
public final class ScoringSnapshot extends Instrumentation {
  private String matchId;

  @Override public void onCreate(Bundle arguments) {
    super.onCreate(arguments);
    matchId = arguments.getString("matchId", "");
    start();
  }

  // Inspection must not initialize the target application or run its sync hooks.
  @Override public void callApplicationOnCreate(Application application) { }

  @Override public void onStart() {
    Bundle result = new Bundle();
    try {
      if (!matchId.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) {
        throw new IllegalArgumentException("A scoped match UUID is required");
      }
      if (!getTargetContext().getPackageName().equals("com.vcreativestudio.sportstage")) {
        throw new IllegalStateException("Unexpected target app");
      }
      File path = new File(getTargetContext().getFilesDir(), "SQLite/wricket.db");
      if (!path.isFile()) throw new IllegalStateException("Existing scoring database is missing");
      try (SQLiteDatabase db = SQLiteDatabase.openDatabase(path.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY)) {
        JSONObject snapshot = new JSONObject();
        snapshot.put("migrations", rows(db, "SELECT version,name FROM schema_migrations ORDER BY version", new String[]{}));
        snapshot.put("match", rows(db, "SELECT * FROM matches WHERE id=?", new String[]{matchId}));
        snapshot.put("innings", rows(db, "SELECT * FROM innings WHERE match_id=? ORDER BY sequence", new String[]{matchId}));
        snapshot.put("session", rows(db, "SELECT * FROM scoring_sessions WHERE match_id=?", new String[]{matchId}));
        snapshot.put("balls", rows(db, "SELECT * FROM balls WHERE innings_id IN (SELECT id FROM innings WHERE match_id=?) ORDER BY over_no,ball_in_over,created_at,id", new String[]{matchId}));
        snapshot.put("outbox", rows(db, "SELECT * FROM scoring_event_outbox WHERE match_id=? ORDER BY created_at,client_event_id", new String[]{matchId}));
        result.putString("snapshot", snapshot.toString());
      }
      finish(Activity.RESULT_OK, result);
    } catch (Exception error) {
      result.putString("inspectionError", error.getClass().getSimpleName());
      finish(Activity.RESULT_CANCELED, result);
    }
  }

  private JSONArray rows(SQLiteDatabase db, String sql, String[] arguments) throws Exception {
    JSONArray rows = new JSONArray();
    try (Cursor cursor = db.rawQuery(sql, arguments)) {
      while (cursor.moveToNext()) {
        JSONObject row = new JSONObject();
        for (int i=0; i<cursor.getColumnCount(); i++) {
          Object value;
          switch (cursor.getType(i)) {
            case Cursor.FIELD_TYPE_NULL: value = JSONObject.NULL; break;
            case Cursor.FIELD_TYPE_INTEGER: value = cursor.getLong(i); break;
            case Cursor.FIELD_TYPE_FLOAT: value = cursor.getDouble(i); break;
            case Cursor.FIELD_TYPE_BLOB: throw new IllegalStateException("Unexpected binary scoring data");
            default: value = cursor.getString(i);
          }
          row.put(cursor.getColumnName(i), value);
        }
        rows.put(row);
      }
    }
    return rows;
  }
}
