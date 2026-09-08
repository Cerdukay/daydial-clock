package com.daydial.app;

import android.content.Intent;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DayDialWidget")
public class DayDialWidgetPlugin extends Plugin {
    private static final String UPDATE_ACTION = "com.daydial.app.WIDGET_UPDATE";

    @PluginMethod
    public void sendBroadcast(PluginCall call) {
        String action = call.getString("action", UPDATE_ACTION);
        if (!UPDATE_ACTION.equals(action)) {
            call.reject("Unsupported widget broadcast action");
            return;
        }

        Intent intent = new Intent(UPDATE_ACTION);
        intent.setPackage(getContext().getPackageName());
        getContext().sendBroadcast(intent);
        call.resolve();
    }
}
