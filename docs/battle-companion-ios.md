# Battle Companion iOS sender

The browser side is ready for a LiveKit room. The native sender should be an Xcode iOS project with two targets:

- `PokePaneCapture`: session setup, room-code entry, and the system broadcast picker.
- `PokePaneBroadcast`: a ReplayKit Broadcast Upload Extension that publishes screen sample buffers.

## Current browser contract

`POST /api/livekit/token` accepts:

```json
{ "roomName": "battle-ABC123", "role": "viewer" }
```

The iOS app should request the same endpoint with `role: "publisher"`, then join the returned `url` and token. The browser joins as a viewer and waits for the iPhone's video track.

The endpoint currently requires the existing Poke Pane app authentication cookie. For a public iPhone pairing flow, add a short-lived pairing code or signed handoff token rather than exposing the app password to the native app.

## Xcode setup

1. Create a Swift iOS app named `PokePaneCapture`.
2. Add a **Broadcast Upload Extension** target named `PokePaneBroadcast`.
3. Add the LiveKit Swift package to both targets.
4. Add the same App Group to both targets, for example `group.com.example.pokepane`.
5. Use LiveKit's `LKSampleHandler` as the extension's `SampleHandler`.
6. Present `BroadcastManager.shared.requestActivation()` from the main app after the publisher has stored its session details in the App Group.
7. Test on a physical iPhone, start the broadcast, and switch to the game.

The extension is required because in-app iOS capture only captures the current application. A Broadcast Upload Extension is needed when the user switches to another app.
