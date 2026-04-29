<#
.SYNOPSIS
  Builds the Photo Booth Kiosk Android APK using Capacitor.

.DESCRIPTION
  This script:
    1. Checks all prerequisites (Node.js, npm, Java JDK 17+, Android SDK)
    2. Installs Capacitor npm dependencies
    3. Adds the Android platform if not already present
    4. Syncs web assets into the native project
    5. Patches AndroidManifest.xml for camera + USB host permissions
    6. Builds a debug APK with Gradle
    7. Prints the exact path of the finished APK

  Run once to set up; re-run after any change to the web files to rebuild.

.NOTES
  Prerequisites (must be installed before running this script):
    - Node.js 18+       https://nodejs.org/
    - Java JDK 17+      bundled with Android Studio, or https://adoptium.net/
    - Android Studio    https://developer.android.com/studio
      (install the Android SDK via SDK Manager inside Android Studio)

  After building, sideload the APK to the tablet:
    Option A - USB:  adb install "android\app\build\outputs\apk\debug\app-debug.apk"
    Option B - File: copy app-debug.apk to the tablet, open it in Files,
                     enable "Install from unknown sources" when prompted.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────
function Write-Step { param($msg) Write-Host "`n▶  $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host "   ✓  $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "   ⚠  $msg" -ForegroundColor Yellow }
function Write-Fail { param($msg) Write-Host "`n✖  $msg" -ForegroundColor Red; exit 1 }

function Require-Command {
    param($Cmd, $InstallHint)
    if (-not (Get-Command $Cmd -ErrorAction SilentlyContinue)) {
        Write-Fail "$Cmd was not found. $InstallHint"
    }
    Write-Ok "$Cmd found"
}

# ─────────────────────────────────────────────────────────────
# 0. Move to project root (where this script lives)
# ─────────────────────────────────────────────────────────────
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot
Write-Host "`nPhoto Booth Kiosk — APK Builder" -ForegroundColor Magenta
Write-Host "Project root: $ProjectRoot"

# ─────────────────────────────────────────────────────────────
# 1. Check prerequisites
# ─────────────────────────────────────────────────────────────
Write-Step "Checking prerequisites"

Require-Command "node" "Install Node.js 18+ from https://nodejs.org/"
$nodeVer = (node --version) -replace "v",""
if ([version]$nodeVer -lt [version]"18.0.0") {
    Write-Fail "Node.js 18 or newer is required (found $nodeVer). Download from https://nodejs.org/"
}
Write-Ok "Node.js $nodeVer"

Require-Command "npm" "npm ships with Node.js — reinstall Node.js from https://nodejs.org/"

Require-Command "java" "Install JDK 17 via Android Studio (SDK Manager) or from https://adoptium.net/"
$javaVer = (java -version 2>&1 | Select-String "version").ToString()
Write-Ok "Java: $javaVer"

# Check ANDROID_HOME / ANDROID_SDK_ROOT
$sdkPath = $env:ANDROID_HOME
if (-not $sdkPath) { $sdkPath = $env:ANDROID_SDK_ROOT }
if (-not $sdkPath) {
    # Common Android Studio default locations
    $candidates = @(
        "$env:LOCALAPPDATA\Android\Sdk",
        "$env:USERPROFILE\AppData\Local\Android\Sdk"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { $sdkPath = $c; break }
    }
}
if (-not $sdkPath -or -not (Test-Path $sdkPath)) {
    Write-Fail (
        "Android SDK not found. Steps:`n" +
        "  1. Install Android Studio: https://developer.android.com/studio`n" +
        "  2. Open Android Studio → SDK Manager → install Android API 34`n" +
        "  3. Set environment variable ANDROID_HOME to the SDK path`n" +
        "     (usually: $env:LOCALAPPDATA\Android\Sdk)`n" +
        "  4. Re-run this script."
    )
}
$env:ANDROID_HOME     = $sdkPath
$env:ANDROID_SDK_ROOT = $sdkPath
Write-Ok "Android SDK: $sdkPath"

# ─────────────────────────────────────────────────────────────
# 2. Install npm dependencies
# ─────────────────────────────────────────────────────────────
Write-Step "Installing npm dependencies (Capacitor)"
npm install
if ($LASTEXITCODE -ne 0) { Write-Fail "npm install failed." }
Write-Ok "npm dependencies installed"

# ─────────────────────────────────────────────────────────────
# 3. Add Android platform (only needed on first run)
# ─────────────────────────────────────────────────────────────
$manifestPath = "android\app\src\main\AndroidManifest.xml"
if (-not (Test-Path $manifestPath)) {
    # The android/ folder may exist as an empty shell from a previous partial run.
    # Cap add android won't overwrite it, so remove the shell first.
    if (Test-Path "android") {
        Write-Step "Removing incomplete Android platform folder and re-initializing"
        Remove-Item -Recurse -Force "android"
    } else {
        Write-Step "Adding Android platform"
    }
    npx cap add android
    if ($LASTEXITCODE -ne 0) { Write-Fail "cap add android failed." }
    Write-Ok "Android platform added"
} else {
    Write-Step "Android platform already present — skipping cap add"
}

# ─────────────────────────────────────────────────────────────
# 4. Copy web assets to www/ then sync into the native project
# ─────────────────────────────────────────────────────────────
Write-Step "Copying web assets to www/"
$webFiles = @("index.html","app.js","styles.css","manifest.json","pb-constants.js","pb-state.js","pb-stitch.js")
if (-not (Test-Path "www")) { New-Item -ItemType Directory -Path "www" | Out-Null }
foreach ($f in $webFiles) {
    if (Test-Path $f) { Copy-Item $f "www\$f" -Force }
}
# Copy any sub-folders that belong to the web layer (icons, fonts, etc.)
foreach ($d in (Get-ChildItem -Directory | Where-Object { $_.Name -notin @("android","node_modules","www","plugin-src",".git") })) {
    Copy-Item $d.FullName "www\$($d.Name)" -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Ok "Web assets copied to www/"

Write-Step "Syncing web assets to Android project"
npx cap sync android
if ($LASTEXITCODE -ne 0) { Write-Fail "cap sync failed." }
Write-Ok "Web assets synced"

# ─────────────────────────────────────────────────────────────
# 5. Patch AndroidManifest.xml — camera, audio, storage, USB
# ─────────────────────────────────────────────────────────────
Write-Step "Patching AndroidManifest.xml"

# $manifestPath was set in step 3 above; guard in case someone runs this section standalone
if (-not $manifestPath) { $manifestPath = "android\app\src\main\AndroidManifest.xml" }
if (-not (Test-Path $manifestPath)) {
    Write-Fail "AndroidManifest.xml not found at $manifestPath"
}

$manifest = Get-Content $manifestPath -Raw

# Permissions to inject (idempotent — only added if not already present)
$permissionsNeeded = @(
    '<uses-permission android:name="android.permission.CAMERA" />',
    '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
    '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
    '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />',
    '<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />',
    '<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />',
    '<uses-feature android:name="android.hardware.usb.host" />'
)

$changed = $false
foreach ($perm in $permissionsNeeded) {
    # Match by the android:name value to avoid duplicate insertions
    $nameMatch = [regex]::Match($perm, 'android:name="([^"]+)"')
    $nameVal   = if ($nameMatch.Success) { $nameMatch.Groups[1].Value } else { $perm }
    if ($manifest -notmatch [regex]::Escape($nameVal)) {
        # Insert before </manifest>
        $manifest = $manifest -replace '</manifest>', "    $perm`n</manifest>"
        $changed  = $true
        Write-Ok "Added: $nameVal"
    } else {
        Write-Ok "Already present: $nameVal"
    }
}
if ($changed) { $manifest | Set-Content $manifestPath -Encoding UTF8 }

# Ensure the activity supports fullscreen + landscape
if ($manifest -notmatch 'screenOrientation') {
    $manifest = $manifest -replace '(android:name="MainActivity"[^>]*)',
        '$1' + "`n            android:screenOrientation=`"sensorLandscape`""
    $manifest | Set-Content $manifestPath -Encoding UTF8
    Write-Ok "Set screenOrientation = sensorLandscape"
}

# Add USB device intent-filter to MainActivity for auto-launch on camera attach (idempotent)
$manifest = Get-Content $manifestPath -Raw
if ($manifest -notmatch 'android.hardware.usb.action.USB_DEVICE_ATTACHED') {
    $usbFilter = @"

            <intent-filter>
                <action android:name="android.hardware.usb.action.USB_DEVICE_ATTACHED" />
            </intent-filter>
            <meta-data
                android:name="android.hardware.usb.action.USB_DEVICE_ATTACHED"
                android:resource="@xml/device_filter" />
"@
    $manifest = $manifest -replace '(<activity[^>]*android:name="MainActivity"[^>]*>)', "`$1$usbFilter"
    $manifest | Set-Content $manifestPath -Encoding UTF8
    Write-Ok "Added USB_DEVICE_ATTACHED intent-filter to MainActivity"
}

# ─────────────────────────────────────────────────────────────
# 5b. Add UVC camera plugin files
# ─────────────────────────────────────────────────────────────
Write-Step "Installing UVC camera plugin files"

# device_filter.xml — tells Android which USB devices to route to this app
$xmlDir = "android\app\src\main\res\xml"
if (-not (Test-Path $xmlDir)) { New-Item -ItemType Directory -Path $xmlDir | Out-Null }
$deviceFilter = @'
<?xml version="1.0" encoding="utf-8"?>
<!-- Matches UVC (USB Video Class) devices: class=0x0E (Video), any subclass/protocol -->
<resources>
    <usb-device class="14" />
</resources>
'@
Set-Content "$xmlDir\device_filter.xml" $deviceFilter -Encoding UTF8
Write-Ok "Written: device_filter.xml"

# UvcCameraPlugin.kt
$pluginDir = "android\app\src\main\java\com\photobooth\kiosk\plugins"
if (-not (Test-Path $pluginDir)) { New-Item -ItemType Directory -Path $pluginDir | Out-Null }
$pluginSrc = Get-Content "plugin-src\UvcCameraPlugin.kt" -Raw -ErrorAction SilentlyContinue
if (-not $pluginSrc) {
    Write-Warn "plugin-src\UvcCameraPlugin.kt not found — skipping copy"
} else {
    Copy-Item "plugin-src\UvcCameraPlugin.kt" "$pluginDir\UvcCameraPlugin.kt" -Force
    Write-Ok "Copied UvcCameraPlugin.kt"
}
# Patch android/app/build.gradle — add JitPack + AndroidUSBCamera library
$appGradlePath = "android\app\build.gradle"
if (Test-Path $appGradlePath) {
    $appGradle = Get-Content $appGradlePath -Raw
    if ($appGradle -notmatch 'AndroidUSBCamera') {
        $appGradle = $appGradle -replace '(dependencies\s*\{)', "`$1`n    implementation 'com.github.jiangdongguo.AndroidUSBCamera:libausbc:3.3.3'"
        $appGradle | Set-Content $appGradlePath -Encoding UTF8
        Write-Ok "Added AndroidUSBCamera dependency to app/build.gradle"
    } else {
        Write-Ok "AndroidUSBCamera dependency already present"
    }
} else {
    Write-Warn "android\app\build.gradle not found — cannot add UVC library (run cap add android first)"
}

# Patch android/build.gradle — add JitPack maven repository
$rootGradlePath = "android\build.gradle"
if (Test-Path $rootGradlePath) {
    $rootGradle = Get-Content $rootGradlePath -Raw
    if ($rootGradle -notmatch 'jitpack.io') {
        $rootGradle = $rootGradle -replace "(allprojects\s*\{[^}]*repositories\s*\{)", "`$1`n        maven { url 'https://jitpack.io' }"
        $rootGradle | Set-Content $rootGradlePath -Encoding UTF8
        Write-Ok "Added JitPack repository to root build.gradle"
    } else {
        Write-Ok "JitPack repository already present"
    }
} else {
    Write-Warn "android\build.gradle not found — cannot add JitPack repo (run cap add android first)"
}

# Patch MainActivity.kt — register UvcCameraPlugin (idempotent)
$mainActivityPath = "android\app\src\main\java\com\photobooth\kiosk\MainActivity.kt"
if (Test-Path $mainActivityPath) {
    $mainActivity = Get-Content $mainActivityPath -Raw
    if ($mainActivity -notmatch 'UvcCameraPlugin') {
        # Add import
        $mainActivity = $mainActivity -replace '(import com\.getcapacitor\.BridgeActivity)',
            "import com.photobooth.kiosk.plugins.UvcCameraPlugin`n`$1"
        # Register in onCreate or via @CapacitorPlugin annotation list
        if ($mainActivity -match 'registerPlugin\(') {
            # Already has registerPlugin calls — append ours
            $mainActivity = $mainActivity -replace '(registerPlugin\([^)]+\))',
                "`$1`n        registerPlugin(UvcCameraPlugin::class.java)"
        } else {
            # Minimal MainActivity — inject override onCreate
            $mainActivity = $mainActivity -replace '(class MainActivity : BridgeActivity\(\)\s*\{)',
                "`$1`n    override fun onCreate(savedInstanceState: android.os.Bundle?) {`n        registerPlugin(UvcCameraPlugin::class.java)`n        super.onCreate(savedInstanceState)`n    }"
        }
        $mainActivity | Set-Content $mainActivityPath -Encoding UTF8
        Write-Ok "Registered UvcCameraPlugin in MainActivity.kt"
    } else {
        Write-Ok "UvcCameraPlugin already registered"
    }
} else {
    Write-Warn "MainActivity.kt not found at expected path — skipping plugin registration"
}

# ─────────────────────────────────────────────────────────────
# 6. Build the debug APK
# ─────────────────────────────────────────────────────────────
Write-Step "Building debug APK (this takes 1–3 minutes on first build)"
Push-Location "android"
try {
    .\gradlew.bat assembleDebug --no-daemon
    if ($LASTEXITCODE -ne 0) { Write-Fail "Gradle build failed. Check the output above for errors." }
} finally {
    Pop-Location
}

# ─────────────────────────────────────────────────────────────
# 7. Done — print result
# ─────────────────────────────────────────────────────────────
$apkPath = Resolve-Path "android\app\build\outputs\apk\debug\app-debug.apk"
$apkSize = [math]::Round((Get-Item $apkPath).Length / 1MB, 1)

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✅  APK built successfully!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  File : $apkPath"
Write-Host "  Size : $apkSize MB"
Write-Host ""
Write-Host "  HOW TO INSTALL ON YOUR TABLET" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Option A — USB cable (fastest):"
Write-Host "    1. Enable Developer Options on the tablet:"
Write-Host "       Settings → About Tablet → tap Build Number 7 times"
Write-Host "    2. Enable USB Debugging in Developer Options"
Write-Host "    3. Plug tablet into this PC and run:"
Write-Host "       adb install `"$apkPath`"" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Option B — file transfer (no USB debugging needed):"
Write-Host "    1. Copy  app-debug.apk  to the tablet (USB / Google Drive / etc.)"
Write-Host "    2. On the tablet, open the file in Files app"
Write-Host "    3. When prompted, enable  Install from unknown sources  for Files"
Write-Host "    4. Tap Install"
Write-Host ""
Write-Host "  After installing, open  Photo Booth  from the home screen."
Write-Host "  The app runs fully offline — no browser or server needed."
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Green
