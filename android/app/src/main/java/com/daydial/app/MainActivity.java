package com.daydial.app;

import android.os.Bundle;
import android.content.pm.ApplicationInfo;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Keep production WebViews locked down while allowing CDP-driven QA in
        // debug builds. Apply the flag before Capacitor creates the WebView so
        // a release process never opens a DevTools socket, even briefly.
        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(debuggable);
        registerPlugin(DayDialWidgetPlugin.class);
        super.onCreate(savedInstanceState);
        // Capacitor also applies its config while building the bridge. Re-assert
        // the release policy on the next UI turn after bridge initialization.
        getWindow().getDecorView().post(() -> WebView.setWebContentsDebuggingEnabled(debuggable));
    }
}
