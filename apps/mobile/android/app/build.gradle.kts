import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Push: Firebase konfiguratsiyasi bo'lsa — Google services plagini.
// Fayl yo'q bo'lsa (lokal ishlab chiqish, CI) ilova pushsiz yig'iladi,
// `Firebase.initializeApp()` esa `main()` da xavfsiz yiqiladi.
// Fayl Firebase konsolidan olinadi va gitga KIRITILMAYDI (docs/20).
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

// Reliz imzosi: `android/key.properties` (gitda YO'Q, docs/20).
//
// Fayl bo'lmasa reliz ham debug kaliti bilan imzolanadi — CI tekshiruvi
// uchun yetarli. Bunday fayl do'konga YUKLANMAYDI: Play Console debug
// imzoli paketni rad etadi, `build-mobile-release.sh` esa kalitsiz
// umuman yig'maydi.
val keystoreProperties =
    Properties().apply {
        val file = rootProject.file("key.properties")
        if (file.exists()) file.inputStream().use { load(it) }
    }
val hasReleaseKey = keystoreProperties.getProperty("storeFile") != null

android {
    namespace = "uz.karvon.karvon"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        // flutter_local_notifications `java.time` API'sini eski Android'da
        // ham ishlatadi — desugaring'siz reliz yig'ilmaydi
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // Do'kondagi identifikator: bir marta tanlanadi va KEYIN
        // O'ZGARTIRIB BO'LMAYDI — o'zgarsa bu boshqa ilova hisoblanadi.
        // Xarita plitkalari so'rovidagi `userAgentPackageName` ham shu.
        applicationId = "uz.karvon.app"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // pubspec.yaml dagi `version: x.y.z+N` dan
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (hasReleaseKey) {
            create("release") {
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig =
                if (hasReleaseKey) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
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

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
