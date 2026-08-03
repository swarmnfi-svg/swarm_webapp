plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.dagger.hilt.android")
    id("com.google.devtools.ksp")
}

import java.util.Properties

val novaVersionProps = Properties().apply {
    rootProject.file("version.properties").inputStream().use(::load)
}
fun novaVersionInt(key: String): Int =
    novaVersionProps.getProperty(key)?.toInt()
        ?: error("Missing or invalid version.properties key: $key")

val novaMajor = novaVersionInt("major")
val novaMinor = novaVersionInt("minor")
val novaPatch = novaVersionInt("patch")

if (novaPatch !in 0..99) {
    error("NOVA Chat patch must be 0–99 (next after 1.2.99 is 1.3.0); got $novaPatch")
}

val novaVersionCode = novaMajor * 10000 + novaMinor * 100 + novaPatch
val novaSemver = "$novaMajor.$novaMinor.$novaPatch"

/**
 * Local emulator API override — **debug builds only**.
 * Release flavors always bake production hosts (never this property).
 *
 *   ./gradlew :app:assembleBpgDebug -PnovaApiBaseUrl=http://10.0.2.2:3000
 *   ./gradlew :app:assembleBpgDebug -PnovaDebugLocalApi=true   # same as 10.0.2.2:3000
 */
val novaApiBaseUrlOverride: String? =
    (findProperty("novaApiBaseUrl") as? String)?.trim()?.takeIf { it.isNotEmpty() }
val novaDebugLocalApi: Boolean =
    (findProperty("novaDebugLocalApi") as? String)?.equals("true", ignoreCase = true) == true
val novaDebugApiBaseUrl: String? =
    novaApiBaseUrlOverride
        ?: if (novaDebugLocalApi) "http://10.0.2.2:3000" else null

android {
    namespace = "com.empower.nova.chat"
    compileSdk = 35

    defaultConfig {
        minSdk = 26
        targetSdk = 35
        versionCode = novaVersionCode
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField("String", "CLIENT_ID", "\"nova-android\"")
        buildConfigField("String", "APP_KIND", "\"nova\"")
    }

    flavorDimensions += "plane"
    productFlavors {
        create("bpg") {
            dimension = "plane"
            applicationId = "com.empower.nova.bpg.android"
            versionName = "${novaSemver}b"
            // Production always — do not honor -PnovaApiBaseUrl here (that poisoned release builds).
            buildConfigField("String", "API_BASE_URL", "\"https://erp.empowerbpg.com\"")
            // User-facing plane brand — never "BPG" (internal/catalog only).
            buildConfigField("String", "PLANE_LABEL", "\"Biopower\"")
            buildConfigField("String", "PLANE_TAGLINE", "\"Accounts & ERP · Biopower\"")
            buildConfigField("boolean", "SHOW_BIOPOWER", "true")
            buildConfigField("String", "ERP_ORIGIN", "\"https://erp.empowerbpg.com\"")
            buildConfigField("String", "ERP_PACKAGE_ID", "\"com.empower.bpg.android\"")
            buildConfigField("String", "LAUNCHER_BG", "\"#FFFFFF\"")
            resValue("string", "app_name", "NOVA Chat ${novaSemver}b")
        }
        create("saas") {
            dimension = "plane"
            applicationId = "com.empower.nova.saas.android"
            versionName = "${novaSemver}s"
            buildConfigField("String", "API_BASE_URL", "\"https://accounts.empowerapp.in\"")
            buildConfigField("String", "PLANE_LABEL", "\"SaaS\"")
            buildConfigField("String", "PLANE_TAGLINE", "\"Accounts & ERP\"")
            buildConfigField("boolean", "SHOW_BIOPOWER", "false")
            buildConfigField("String", "ERP_ORIGIN", "\"https://accounts.empowerapp.in\"")
            buildConfigField("String", "ERP_PACKAGE_ID", "\"com.empower.saas.android\"")
            buildConfigField("String", "LAUNCHER_BG", "\"#E8EEF5\"")
            resValue("string", "app_name", "NOVA Chat ${novaSemver}s")
        }
    }

    signingConfigs {
        // Same sideload pattern as apps/empower-bpg-android — debug keystore, not Play Store release.
        create("release") {
            storeFile = file("${System.getProperty("user.home")}/.android/debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        debug {
            isDebuggable = true
            // Default: same production URL as flavor (sideload-safe).
            // Opt into emulator→host only with -PnovaDebugLocalApi=true or -PnovaApiBaseUrl=…
            novaDebugApiBaseUrl?.let { url ->
                buildConfigField("String", "API_BASE_URL", "\"$url\"")
            }
        }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
            // Explicit: release never inherits a debug local API override.
            // Flavor API_BASE_URL (production) is the sole source of truth.
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.navigation:navigation-compose:2.8.5")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("androidx.browser:browser:1.8.0")

    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-moshi:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("com.squareup.moshi:moshi-kotlin:1.15.1")
    ksp("com.squareup.moshi:moshi-kotlin-codegen:1.15.1")

    implementation("com.google.dagger:hilt-android:2.52")
    ksp("com.google.dagger:hilt-compiler:2.52")
    implementation("androidx.hilt:hilt-navigation-compose:1.2.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
