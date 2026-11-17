import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Task 155 — PERMANENT release signing key (same key.properties + release-key.jks
// committed for the hrms_app releases, now shared with the WebView shell) so the
// new build ships the SAME signature as installed v1.7.1 devices and upgrades
// cleanly over them instead of failing with "App not installed".
val keystoreProperties = Properties().apply {
    val f = rootProject.file("key.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "com.threeboxes.three_boxes_hrms"
    compileSdk = flutter.compileSdkVersion
    // Task 155: ndkVersion removed — all plugins are JVM-only (no native code),
    // and the sandbox cannot fit the 2GB NDK download (same as hrms_app Task 142).

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // Task 155 — applicationId aligned with the released hrms_app package
        // (com.threeboxes.hrms_app, v1.7.1 build 35) so this WebView-shell app
        // UPDATES the installed app in place. The namespace (and Kotlin
        // MainActivity package) stays com.threeboxes.three_boxes_hrms.
        applicationId = "com.threeboxes.hrms_app"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            val storeFilePath = keystoreProperties.getProperty("storeFile")
            if (storeFilePath != null) {
                // key.properties paths are relative to the android/ root project dir
                storeFile = rootProject.file(storeFilePath)
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // Signed with the committed release key (key.properties). Falls
            // back to debug signing only when key.properties is missing
            // (e.g. a bare source checkout), so `flutter run --release` still works.
            signingConfig = if (keystoreProperties.getProperty("storeFile") != null) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
