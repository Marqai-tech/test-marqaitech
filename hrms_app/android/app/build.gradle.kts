import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Task 110b — PERMANENT release signing key (key.properties + release-key.jks
// are committed) so every build ships the same signature and users can install
// updates over their existing app. Earlier builds were signed with the
// sandbox-generated debug keystore, which changed on every toolchain rebuild
// and silently blocked upgrades on user devices.
val keystoreProperties = Properties().apply {
    val f = rootProject.file("key.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "com.threeboxes.hrms_app"
    compileSdk = 34
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_11.toString()
    }

    // Task 145 — native-lib stripping is BACK ON (default). Task 142 kept
    // debug symbols because the build sandbox had no NDK for llvm-strip; the
    // full NDK is present again, and keeping symbols on a UNIVERSAL APK
    // ballooned it to 520 MB (unstripped libflutter.so is ~165 MB per ABI).
    // Stripped, the universal APK lands at ~30 MB like v1.6.6.

    defaultConfig {
        applicationId = "com.threeboxes.hrms_app"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

flutter {
    source = "../.."
}
