import java.util.Properties

plugins {
    id("com.android.application")
    // START: FlutterFire Configuration
    id("com.google.gms.google-services")
    // END: FlutterFire Configuration
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Llave de release (estable): si existe android/key.properties se firma con ella, y así cada versión
// nueva se instala ENCIMA de la anterior sin desinstalar (la sesión y el número verificado no se
// pierden). Sin ese archivo (CI, demo, otra computadora) se firma con la de depuración, como antes.
// Para crearla: ver app/android/LLAVE.md. key.properties y el .jks NUNCA van a git.
val archivoLlave = rootProject.file("key.properties")
val llave = Properties().apply { if (archivoLlave.exists()) archivoLlave.inputStream().use { load(it) } }
val hayLlaveRelease = archivoLlave.exists() && llave.getProperty("storeFile")?.let { rootProject.file(it).exists() } == true

android {
    namespace = "mx.alertacerca.alerta_cerca"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        // flutter_local_notifications necesita "core library desugaring"
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "mx.alertacerca.alerta_cerca"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = maxOf(flutter.minSdkVersion, 23)
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (hayLlaveRelease) {
            create("release") {
                storeFile = rootProject.file(llave.getProperty("storeFile"))
                storePassword = llave.getProperty("storePassword")
                keyAlias = llave.getProperty("keyAlias")
                keyPassword = llave.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // Con android/key.properties: llave de release estable (misma firma en cada versión → se
            // instala encima sin desinstalar). Sin ese archivo: la de depuración, para que CI y la
            // demo compilen igual.
            signingConfig = if (hayLlaveRelease) {
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

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
    // Tema AppCompat: el aviso de huella o PIN para detener el SOS (local_auth) lo necesita en Android 8 y anteriores
    implementation("androidx.appcompat:appcompat:1.7.0")
}
