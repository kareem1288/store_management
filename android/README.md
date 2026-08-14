# My Sales Android

Trusted Web Activity wrapper for `https://mysales.m.frappe.cloud/`.

Regenerate Android resources after editing `twa-manifest.json`:

```bash
npx --yes @bubblewrap/cli update
```

Build unsigned APK/AAB artifacts for validation:

```bash
npx --yes @bubblewrap/cli build --skipSigning
```

Build signed Play Store artifacts after securely configuring the upload key:

```bash
npx --yes @bubblewrap/cli build
```

Alternatively, build a debug APK with Gradle:

```bash
./gradlew assembleDebug
```

The APK is generated at `app/build/outputs/apk/debug/app-debug.apk`.

Do not commit `android.keystore` or signing passwords. For a verified fullscreen
TWA, publish the signing certificate fingerprint at
`https://mysales.m.frappe.cloud/.well-known/assetlinks.json`.
