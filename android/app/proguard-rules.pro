# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# React Native & TurboModules
-keep class com.facebook.react.** { *; }
-keepclassmembers class * extends com.facebook.react.bridge.NativeModule {
    public <methods>;
}
-keepclassmembers class * extends com.facebook.react.bridge.ReactContextBaseJavaModule {
    public <methods>;
}
-keep @com.facebook.react.bridge.ReactMethod class * { *; }
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod *;
}

# Room Database & DAOs & Entities
-keep class androidx.room.** { *; }
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class * { *; }
-keep @androidx.room.Dao class * { *; }
-keepclassmembers class * {
    @androidx.room.Dao *;
    @androidx.room.Database *;
    @androidx.room.Entity *;
}
-keep class com.aireader.library.** { *; }
-keepclassmembers class com.aireader.library.** { *; }

# ONNX Runtime Mobile
-keep class ai.onnxruntime.** { *; }
-keepclassmembers class ai.onnxruntime.** { *; }

# PDFBox Android
-keep class com.tom_roush.pdfbox.** { *; }
-dontwarn com.tom_roush.pdfbox.**

# Jsoup HTML/XML parser
-keep class org.jsoup.** { *; }
-dontwarn org.jsoup.**

# WorkManager
-keep class androidx.work.** { *; }
-keepclassmembers class * extends androidx.work.Worker {
    public <init>(android.content.Context, androidx.work.WorkerParameters);
}
-keepclassmembers class * extends androidx.work.ListenableWorker {
    public <init>(android.content.Context, androidx.work.WorkerParameters);
}

# MediaSession & Media3
-keep class androidx.media.** { *; }
-keep class android.support.v4.media.** { *; }
