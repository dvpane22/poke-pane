import SwiftUI

@main
struct PokePaneCaptureApp: App {
    @StateObject private var session = CaptureSession()

    var body: some Scene {
        WindowGroup {
            ContentView(session: session)
        }
    }
}
