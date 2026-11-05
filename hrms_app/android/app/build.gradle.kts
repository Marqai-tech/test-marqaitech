import java.util.Properties

plugins {
    id("com.android.application")
    // Task 142: AGP 9 + android.builtInKotlin=false require the Kotlin plugin
    // to be applied explicitly for the kotlin { } compilerOptions block below.
    id("org.jetbrains.kotlin.android")
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
    compileSdk = flutter.compileSdkVersion
    // Task 142: ndkVersion removed — all plugins are JVM-only (no native code),
    // and the sandbox cannot fit the 2GB NDK download.

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    // Task 145 — native-lib stripping is BACK ON (default). Task 142 kept
    // debug symbols because the build sandbox had no NDK for llvm-strip; the
    // full NDK is present again, and keeping symbols on a UNIVERSAL APK
    // ballooned it to 520 MB (unstripped libflutter.so is ~165 MB per ABI).
    // Stripped, the universal APK lands at ~30 MB like v1.6.6.

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.threeboxes.hrms_app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        // Task 145 — UNIVERSAL APK again (armeabi-v7a + arm64-v8a + x86_64).
        // Task 142 had restricted this to arm64-v8a only; 32-bit (armeabi-v7a)
        // devices then failed to install the update SILENTLY ("App not
        // installed"), because the APK no longer contained native libs for
        // their ABI. Every build up to v1.6.7 shipped all three ABIs and
        // installed fine — restore exactly that coverage. Plugins are
        // JVM-only (no NDK needed); the extra engine .so files come from the
        // Flutter cache.
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
