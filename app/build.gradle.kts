plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
 useLibrary("android.test.runner", false)
 useLibrary("android.test.base", false)
 namespace = "com.aigoldtrader.demo"
 compileSdk = 35
 defaultConfig {
  applicationId = "com.aigoldtrader.demo"
  minSdk = 26
  targetSdk = 35
  versionCode = 4
  versionName = "0.4-screen"
  testInstrumentationRunner = "android.test.InstrumentationTestRunner"
 }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
 kotlinOptions { jvmTarget = "17" }
}
dependencies { testImplementation("junit:junit:4.13.2") }
