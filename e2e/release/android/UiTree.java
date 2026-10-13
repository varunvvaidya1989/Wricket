package com.vcreativestudio.sportstage.releaseinspection;

import android.app.Activity;
import android.app.Instrumentation;
import android.graphics.Rect;
import android.os.Bundle;
import android.view.accessibility.AccessibilityNodeInfo;
import org.json.JSONArray;
import org.json.JSONObject;

/** Samples the current UI without requiring an animation-free idle interval. */
public final class UiTree extends Instrumentation {
  @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }
  @Override public void onStart() {
    Bundle result = new Bundle();
    try {
      JSONArray nodes = new JSONArray();
      AccessibilityNodeInfo root = null;
      long deadline = System.currentTimeMillis()+5000;
      while (root==null && System.currentTimeMillis()<deadline) {
        root = getUiAutomation().getRootInActiveWindow();
        if (root==null) Thread.sleep(200);
      }
      if (root != null) collect(root, nodes);
      result.putString("nodes", nodes.toString());
      finish(Activity.RESULT_OK, result);
    } catch (Exception error) {
      result.putString("uiError", error.getClass().getSimpleName());
      finish(Activity.RESULT_CANCELED, result);
    }
  }
  private void collect(AccessibilityNodeInfo node, JSONArray nodes) throws Exception {
    Rect bounds = new Rect(); node.getBoundsInScreen(bounds);
    if (bounds.width()>0 && bounds.height()>0) {
      JSONObject row = new JSONObject();
      row.put("text", node.isPassword() ? "" : string(node.getText()));
      row.put("content-desc", string(node.getContentDescription()));
      row.put("class", string(node.getClassName()));
      row.put("password", String.valueOf(node.isPassword()));
      row.put("enabled", String.valueOf(node.isEnabled()));
      row.put("bounds", "["+bounds.left+","+bounds.top+"]["+bounds.right+","+bounds.bottom+"]");
      nodes.put(row);
    }
    for (int i=0; i<node.getChildCount(); i++) {
      AccessibilityNodeInfo child = node.getChild(i);
      if (child != null) { collect(child,nodes); child.recycle(); }
    }
  }
  private String string(CharSequence value) { return value==null ? "" : value.toString(); }
}
