# AI Book Reader Mobile

A private, local-first Android book reader built with React Native and TypeScript. Phase 1 provides the navigable product shell and design system. Phase 2 adds the direct, resumable natural-voice download and real on-device Chatterbox Nano inference.

Phase 3 now implements EPUB/PDF/TXT preparation, automatic durable jobs, real chapter/page preview, saved page locations, metadata/cover editing, sorting/filtering and multi-select removal. Books stay in private Room/file storage. Design samples are opt-in. Full Reader tools/notes and imported-book narration remain later phases; prepared text is not prepared audio.

## Current status

- Phase 1 application/UI foundation: code complete.
- Phase 2 model manager and native voice self-test: code complete.
- Phase 3A private book storage, Room schema, document picker, progress, duplicate detection, and removal: implemented.
- Phase 3B/3C: three parsers, Room schema v3 with non-destructive v1/v2 migrations, automatic WorkManager jobs, progress/cancel/retry/reprocess, metadata/cover controls, real Continue reading, virtualized library filters/sorts and batch removal implemented. Final acceptance evidence and remaining release gates: `../docs/phase-3-implementation.md`.
- To try it: Import book → Choose file → Open imported book → Preview prepared text. Preparation starts automatically. Chapter and 24-block page positions are saved; exact-sentence Reader resume comes in Phase 4.
- Limits: source copy 250 MiB; UTF-8 TXT preparation 16 MiB; text PDF preparation 64 MiB / 1,000 pages; shared extracted text 4 million UTF-16 units. EPUB expansion and markup are bounded. Scanned PDFs need OCR (not included); protected files are rejected; PDF reading order carries a layout warning.
- Direct in-app download: resumable, SHA-256 verified, atomically installed, and kept in app-private storage.
- Natural voice: four-stage Chatterbox Nano ONNX pipeline with local WAV generation and playback.
- Safety fallback: offline Android phone voice.
- Voice controls: Battery, Balanced, and Quality modes; cancellation; cleanup; model removal.
- Persistent first launch and theme preferences: complete.
- Typed boundaries for library, model, import, and narration services: complete.
- TypeScript, lint, Android compilation and debug APK build: passing. Current tests: 38 JavaScript + 37 native unit + 14 on-device integration = 89 passing. Updated APK installed; the core EPUB/PDF/TXT/library walkthrough passed on the Motorola phone on September 4, 2026.
- Automated Android APK build: configured in `.github/workflows/mobile-ci.yml`.
- Phase 2 device verification: passed on the connected ARM64 Motorola test phone.
- Phase 3 device checks: picker import, matching private-copy hash, EPUB/PDF/TXT preparation and preview, scan-like PDF failure, restart persistence, metadata/reprocess, cancellation/retry, search/filter/sort, completion and five-book batch removal passed on the Motorola phone. Cleanup left no private books and preserved the 547 MB voice pack. Broader release hardening remains tracked in `../docs/phase-3-implementation.md`.
- Next release gate: 6 GB/8 GB/flagship device matrix, naturalness review, and a 30-minute generation soak.

## Requirements

Native changes require rebuilding/reinstalling the Android app; Metro reload alone cannot add the book-library module. No app-data reset or model re-download is needed. Run `./gradlew assembleDebug testDebugUnitTest` from the Android directory for the APK and native checks.

Database integration tests use isolated test databases; PDF tests use synthetic private fixtures. Build the test APK with `./gradlew assembleDebugAndroidTest`; run on a dedicated device with `./gradlew connectedDebugAndroidTest`. Retain exported schema 1.json and 2.json for migration tests. Generate original manual-test fixtures with `node test-fixtures/generate-phase3.cjs`.

- Node.js 22.13 or newer (see `.nvmrc`).
- Java 17.
- Android Studio and an Android SDK/device.

## Quality checks

```sh
npm run typecheck
npm run lint
npm test -- --runInBand
```

This project was bootstrapped using the official [`@react-native-community/cli`](https://github.com/react-native-community/cli).

# Getting Started

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Android

```sh
# Using npm
npm run android

# OR using Yarn
yarn android
```

### iOS

For iOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

For more information, please visit [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

```sh
# Using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

# Troubleshooting

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.
