allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

// Task 121 — file_picker ships with compileSdk 34, but
// flutter_plugin_android_lifecycle (AGP 9 toolchain) requires every plugin to
// compile against SDK 36. Bump it when the library plugin applies
// (plugins.withId — afterEvaluate is illegal post early-evaluation here).
subprojects {
    project.plugins.withId("com.android.library") {
        if (project.name == "file_picker") {
            project.extensions.findByName("android")?.let { androidExt ->
                try {
                    val setter = androidExt.javaClass.methods.firstOrNull { it.name == "setCompileSdk" }
                    setter?.invoke(androidExt, 36)
                    println("[Task121] file_picker compileSdk forced to 36")
                } catch (t: Throwable) {
                    println("[Task121] could not bump file_picker compileSdk: " + t.message)
                }
            }
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
