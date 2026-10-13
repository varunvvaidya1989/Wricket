package com.vcreativestudio.sportstage.releaseinspection;

import android.app.Activity;
import android.app.Application;
import android.app.Instrumentation;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.os.Bundle;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;

/** Seeds only two named acceptance teams; never seeds scoring or edits history. */
public final class TeamFixture extends Instrumentation {
  private String encoded;
  @Override public void onCreate(Bundle arguments) {
    super.onCreate(arguments); encoded=arguments.getString("fixture", ""); start();
  }
  @Override public void callApplicationOnCreate(Application application) { }
  @Override public void onStart() {
    Bundle result=new Bundle();
    try {
      JSONObject fixture=new JSONObject(new String(Base64.decode(encoded,Base64.NO_WRAP),"UTF-8"));
      String run=fixture.getString("run");
      if (!run.matches("[0-9a-f-]{36}")) throw new IllegalArgumentException("Invalid fixture marker");
      JSONArray teams=fixture.getJSONArray("teams");
      if (teams.length()!=2) throw new IllegalArgumentException("Exactly two fixture teams required");
      File path=new File(getTargetContext().getFilesDir(),"SQLite/wricket.db");
      if (!path.isFile()) throw new IllegalStateException("Existing baseline database required");
      try (SQLiteDatabase db=SQLiteDatabase.openDatabase(path.getAbsolutePath(),null,SQLiteDatabase.OPEN_READWRITE)) {
        db.beginTransaction();
        try {
          for (int i=0;i<teams.length();i++) {
            String id=teams.getString(i);
            if (!id.matches("[0-9a-f-]{36}")) throw new IllegalArgumentException("Invalid team ID");
            String side=i==0?"A":"B";
            String name="RC "+side+" "+run.substring(0,8);
            try (Cursor old=db.rawQuery("SELECT name FROM teams WHERE id=?",new String[]{id})) {
              if (old.moveToFirst() && !old.getString(0).equals(name)) throw new IllegalStateException("Existing data collision");
            }
            long now=System.currentTimeMillis();
            db.execSQL("INSERT OR IGNORE INTO teams(id,name,short_name,color_hex,created_at,cloud_id,sync_status,updated_at) VALUES(?,?,?,'#a6f477',?,?,'SYNCED',?)",new Object[]{id,name,"RC"+side,now,id,now});
          }
          db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
      }
      result.putString("fixtureTeams","2"); finish(Activity.RESULT_OK,result);
    } catch (Exception error) {
      result.putString("fixtureError",error.getClass().getSimpleName()); finish(Activity.RESULT_CANCELED,result);
    }
  }
}
