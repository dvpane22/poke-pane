# Poke Pane Capture

Native iOS sender for Battle Companion.

## Run it

1. Open `PokePaneCapture.xcodeproj` in Xcode.
2. Select your Apple Developer Team for both `PokePaneCapture` and `PokePaneBroadcast`.
3. Confirm the App Group `group.com.pokepane.capture` is registered in your Apple Developer account, or replace it in both entitlements files.
4. In `PokePaneCapture/Shared/CaptureSession.swift`, replace `YOUR_POKE_PANE_HOST` with the HTTPS host running Poke Pane.
5. Build and run on a physical iPhone.
6. Open Battle Companion in the browser, scan its QR code with the iPhone app, and connect. The rear camera starts streaming automatically.

The iOS app requests `/api/livekit/token` with `role: "publisher"`. The current route is protected by Poke Pane's app-auth cookie, so the first device test should either run with app auth disabled or use a temporary authenticated handoff. A follow-up pairing endpoint should exchange a browser-created short-lived code for the publisher token without putting a password in the iOS app.

The app icon is the existing `public/pokepane-logo.png`, resized into the AppIcon asset catalog.
