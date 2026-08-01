import Foundation
import Combine
import LiveKit
import AVFoundation

@MainActor
final class CaptureSession: ObservableObject {
    @Published var roomName = ""
    @Published var serverHost = "https://headed-gene-light-proceeding.trycloudflare.com"
    @Published private(set) var status = "Not connected"
    @Published private(set) var isConnecting = false
    @Published private(set) var isConnected = false
    @Published private(set) var errorMessage: String?

    private var room: Room?

    @discardableResult
    func applyPairingCode(_ value: String) -> Bool {
        guard let url = URL(string: value), url.scheme == "pokepane",
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let room = components.queryItems?.first(where: { $0.name == "room" })?.value,
              let host = components.queryItems?.first(where: { $0.name == "host" })?.value,
              URL(string: host)?.scheme == "https" else {
            errorMessage = "That QR code is not a Poke Pane room code."
            return false
        }
        roomName = room
        serverHost = host.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        errorMessage = nil
        status = "Room loaded — ready to connect"
        return true
    }

    func connect() async {
        let room = roomName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !room.isEmpty else { return }
        isConnecting = true
        errorMessage = nil
        status = "Requesting publisher access…"

        do {
            let request = TokenRequest(roomName: room, role: "publisher")
            var urlRequest = URLRequest(url: URL(string: "\(serverHost)/api/livekit/token")!)
            urlRequest.httpMethod = "POST"
            urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
            urlRequest.httpBody = try JSONEncoder().encode(request)
            let (data, response) = try await URLSession.shared.data(for: urlRequest)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                throw CaptureError.server(String(data: data, encoding: .utf8) ?? "The token request failed.")
            }
            let credentials = try JSONDecoder().decode(TokenResponse.self, from: data)
            let nextRoom = Room()
            try await nextRoom.connect(url: credentials.url, token: credentials.token)
            let cameraOptions = CameraCaptureOptions(
                position: .back,
                dimensions: .h1080_169,
                fps: 30
            )
            let publishOptions = VideoPublishOptions(
                encoding: VideoEncoding(maxBitrate: 4_000_000, maxFps: 30),
                simulcast: false
            )
            guard (try await nextRoom.localParticipant.set(
                source: .camera,
                enabled: true,
                captureOptions: cameraOptions,
                publishOptions: publishOptions
            )) != nil else {
                throw CaptureError.camera("The camera could not be published.")
            }
            self.room = nextRoom
            isConnected = true
            status = "Connected — camera is live"
        } catch {
            errorMessage = error.localizedDescription
            status = "Connection failed"
        }
        isConnecting = false
    }

    func disconnect() {
        let activeRoom = room
        room = nil
        isConnected = false
        isConnecting = false
        status = "Not connected"
        if let activeRoom {
            Task { await activeRoom.disconnect() }
        }
    }

}

private struct TokenRequest: Encodable {
    let roomName: String
    let role: String
}

private struct TokenResponse: Decodable {
    let url: String
    let token: String
}

private enum CaptureError: LocalizedError {
    case server(String)
    case camera(String)
    var errorDescription: String? {
        switch self {
        case .server(let message), .camera(let message): return message
        }
    }
}
