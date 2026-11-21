# Mobile builds (Android APK / iOS)

This replaces `APK_BUILD_GUIDE.md` and the Expo Go parts of `EXPO_GO_DEPLOYMENT.md` (m8).

## Development with Expo Go
Start the backend:
```bash
npm run server:dev
```
In a second terminal, start the Expo dev server:
```bash
npx expo start --localhost --port 8080
```
Scan the QR code with Expo Go. The app finds the API through the Expo `hostUri`. On a server running in demo mode, use the accounts from `data/demo-credentials.txt`.

## Production builds (EAS)
1. Deploy the backend over HTTPS first (see [DEPLOYMENT.md](DEPLOYMENT.md)). A native app cannot reach `localhost`.
2. Set `EXPO_PUBLIC_DOMAIN` for each profile in `eas.json` to your backend host (currently `sankalp-ai.onrender.com`).
3. Install EAS and sign in:
   ```bash
   npm install -g eas-cli
   ```
   ```bash
   eas login
   ```
4. Build:
   ```bash
   eas build --platform android --profile apk
   ```
   Use the `preview` profile for internal testing and `production` for the stores (`eas submit`).

## Notes
- Session tokens are stored in the OS keystore (`expo-secure-store`). Rebuild the native app after upgrading from an older build so the module is linked.
- `react-native-maps` uses Google Maps on Android until M18 (Phase 1) makes the provider configurable. The in-app Leaflet maps use `MAP_TILE_URL`.
- Test the SOS triggers (6 taps, hold, shake, volume, side button) on a physical device before any demo. They cannot be tested in CI.
