# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Preserve line numbers for crash reports.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# --- Capacitor ---
-keep class com.getcapacitor.** { *; }
-keepclassmembers class * {
    @com.getcapacitor.annotation.* <methods>;
    @com.getcapacitor.annotation.* <fields>;
}

# --- Firebase Cloud Messaging ---
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# --- Capacitor plugins ---
-keep class com.capacitorjs.plugins.** { *; }

# --- Keep WebView JS interface ---
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

