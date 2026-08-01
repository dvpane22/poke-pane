import SwiftUI
import VisionKit

struct ContentView: View {
    @ObservedObject var session: CaptureSession
    @State private var scannerPresented = false

    var body: some View {
        ZStack {
            Color(red: 0.035, green: 0.05, blue: 0.07).ignoresSafeArea()

            if session.isConnected {
                Button {
                    session.disconnect()
                } label: {
                    Label("Disconnect", systemImage: "xmark.circle.fill")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                }
                .buttonStyle(.borderedProminent)
                .tint(.red.opacity(0.85))
                .padding(24)
            } else {
                Button {
                    scannerPresented = true
                } label: {
                    Label("Scan QR code", systemImage: "qrcode.viewfinder")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color.mint)
                .foregroundStyle(.black)
                .padding(24)
            }
        }
        .preferredColorScheme(.dark)
        .sheet(isPresented: $scannerPresented) {
            if DataScannerViewController.isSupported && DataScannerViewController.isAvailable {
                QRScannerView { code in
                    scannerPresented = false
                    if session.applyPairingCode(code) {
                        Task { await session.connect() }
                    }
                }
                .ignoresSafeArea()
            } else {
                Text("QR scanning is unavailable on this device.")
                    .foregroundStyle(.secondary)
                    .presentationDetents([.height(180)])
            }
        }
    }
}
