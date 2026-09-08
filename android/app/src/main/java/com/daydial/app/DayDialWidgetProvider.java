package com.daydial.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.text.format.DateFormat;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Home-screen widget that shows the current time and the next event for today.
 *
 * Event data is read from Capacitor Preferences (SharedPreferences key
 * "CapacitorStorage" -> "daydial:events"). The web app writes events there in
 * guest mode. When the user is signed in, events are stored in Neon and the
 * widget shows a count from the last cached snapshot.
 */
public class DayDialWidgetProvider extends AppWidgetProvider {

    private static final String PREFS_NAME = "CapacitorStorage";
    private static final String EVENTS_KEY = "daydial:widget:events";
    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        // Refresh all widgets when a custom update broadcast arrives.
        if ("com.daydial.app.WIDGET_UPDATE".equals(intent.getAction())) {
            AppWidgetManager mgr = AppWidgetManager.getInstance(context);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(context, DayDialWidgetProvider.class));
            for (int id : ids) {
                updateWidget(context, mgr, id);
            }
        }
    }

    static void updateWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_daydial);

        // --- Clock ---
        Date now = new Date();
        boolean use24Hour = DateFormat.is24HourFormat(context);
        SimpleDateFormat timeFmt = new SimpleDateFormat(use24Hour ? "HH:mm" : "h:mm", Locale.getDefault());
        views.setTextViewText(R.id.widget_clock, timeFmt.format(now));

        // --- Date ---
        SimpleDateFormat dateFmt = new SimpleDateFormat("EEE, MMM d", Locale.getDefault());
        views.setTextViewText(R.id.widget_date, dateFmt.format(now));

        // --- Events ---
        List<WidgetEvent> events = readEvents(context);
        Calendar todayStart = startOfDay(now);
        Calendar todayEnd = endOfDay(now);

        List<WidgetEvent> todays = new ArrayList<>();
        for (WidgetEvent e : events) {
            if (e.startAt >= todayStart.getTimeInMillis() && e.startAt < todayEnd.getTimeInMillis()) {
                todays.add(e);
            }
        }

        // Next upcoming event
        WidgetEvent next = null;
        for (WidgetEvent e : todays) {
            if (e.startAt > now.getTime() && !e.isCompleted) {
                if (next == null || e.startAt < next.startAt) {
                    next = e;
                }
            }
        }

        if (next != null) {
            SimpleDateFormat evTime = new SimpleDateFormat(use24Hour ? "HH:mm" : "h:mm a", Locale.getDefault());
            String timeStr = evTime.format(new Date(next.startAt));
            views.setTextViewText(R.id.widget_next_event,
                    context.getString(R.string.widget_next_label, next.title, timeStr));
        } else {
            views.setTextViewText(R.id.widget_next_event, context.getString(R.string.widget_no_events));
        }

        // Event count
        if (todays.isEmpty()) {
            views.setTextViewText(R.id.widget_event_count, context.getString(R.string.widget_no_events));
        } else {
            views.setTextViewText(R.id.widget_event_count,
                    context.getString(R.string.widget_events_count, todays.size()));
        }

        // --- Click -> open app ---
        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.setAction(Intent.ACTION_MAIN);
        launchIntent.addCategory(Intent.CATEGORY_LAUNCHER);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getActivity(context, 0, launchIntent, flags);
        views.setOnClickPendingIntent(R.id.widget_root, pi);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    private static Calendar startOfDay(Date d) {
        Calendar c = Calendar.getInstance();
        c.setTime(d);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        return c;
    }

    private static Calendar endOfDay(Date d) {
        Calendar c = startOfDay(d);
        c.add(Calendar.DAY_OF_MONTH, 1);
        return c;
    }

    /**
     * Read events from Capacitor Preferences. The web app writes a JSON array
     * snapshot to the "daydial:widget:events" key whenever events change.
     */
    private static List<WidgetEvent> readEvents(Context context) {
        List<WidgetEvent> result = new ArrayList<>();
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String raw = prefs.getString(EVENTS_KEY, null);
            if (raw == null || raw.isEmpty()) return result;
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                WidgetEvent e = new WidgetEvent();
                e.title = o.optString("title", "Untitled");
                e.startAt = o.optLong("startAt", 0);
                e.isCompleted = o.optBoolean("isCompleted", false);
                if (e.startAt > 0) result.add(e);
            }
        } catch (Exception e) {
            // ignore parse errors — widget just shows "no events"
        }
        return result;
    }

    static class WidgetEvent {
        String title;
        long startAt;
        boolean isCompleted;
    }
}
