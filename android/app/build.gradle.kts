plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
}

/**
 * The Android app does not keep a second copy of the HTML sources: the web app
 * in ../main is copied into the APK assets during the build. One source of
 * truth, no drift between the browser version and the APK.
 */
val webAssetsOutput = layout.buildDirectory.dir("generated/webassets")

val copyWebAssets by tasks.registering(Copy::class) {
    description = "Copies the DELIES web app (../main) into the APK assets folder."
    from(rootProject.file("../main")) {
        exclude("README.md")
    }
    into(webAssetsOutput.map { it.dir("www") })
    doFirst {
        logger.lifecycle("DELIES: embedding web assets from ${rootProject.file("../main")}")
    }
}

android {
    namespace = "com.delies.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.delies.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 20000
        versionName = "2.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        resourceConfigurations += listOf("ru", "uk", "en")
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
            isDebuggable = true
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
        viewBinding = false
    }

    sourceSets.getByName("main") {
        assets.srcDir(webAssetsOutput)
    }

    packaging {
        resources {
            excludes += setOf(
                "META-INF/AL2.0",
                "META-INF/LGPL2.1",
                "META-INF/*.kotlin_module",
                "DebugProbesKt.bin",
                "kotlin-tooling-metadata.json"
            )
        }
    }

    lint {
        // Warnings are reported but must not block the CI APK build.
        abortOnError = false
        checkReleaseBuilds = false
        warningsAsErrors = false
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

tasks.named("preBuild") {
    dependsOn(copyWebAssets)
}

tasks.matching { it.name == "mergeDebugAssets" || it.name == "mergeReleaseAssets" }.configureEach {
    dependsOn(copyWebAssets)
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("androidx.activity:activity-ktx:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test:runner:1.5.2")
}
