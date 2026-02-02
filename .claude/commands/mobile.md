# Mobile / Capacitor Development

We are working on mobile platform support using Capacitor.

$ARGUMENTS

## Build Commands

- `npm run mobile:build` - Build mobile version
- `npm run mobile:sync` - Sync web assets to native projects
- `npm run mobile:ios` - Open iOS project in Xcode
- `npm run mobile:android` - Open Android project in Android Studio
- `npm run mobile:dev` - Start mobile development server

## Configuration Files

- `capacitor.config.ts` - Capacitor project configuration
- `vite.config.mobile.ts` - Mobile-specific Vite build config
- `svelte.config.mobile.js` - Mobile-specific SvelteKit config
- `src/app.mobile.html` - Mobile HTML entry point

## Platform Adapters

- `src/lib/capacitor/auth.ts` - Native authentication adapter
- `src/lib/capacitor/index.ts` - Capacitor plugin initialization
- `src/lib/device.ts` - Device detection and platform-specific behavior

## Native Directories

- `android/` - Android native project
- `ios/` - iOS native project
- `mobile/` - Shared mobile resources

## Responsive Design

- See `RESPONSIVE.md` for mobile responsive patterns and breakpoints
- CSS variables in `src/css/core.css` define responsive breakpoints
- Mobile-first approach with consistent spacing units
- Touch-friendly interaction targets

## Key Considerations

- Platform detection via `src/lib/device.ts` for conditional behavior
- Native plugins require Capacitor bridge (camera, storage, biometrics)
- Auth flow differs on mobile - uses `src/lib/capacitor/auth.ts`
- Mobile builds use separate Vite/Svelte configs for adapter differences
- Test on both iOS and Android simulators
