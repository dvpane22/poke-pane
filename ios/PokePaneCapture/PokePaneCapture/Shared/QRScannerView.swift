import SwiftUI
import VisionKit

@available(iOS 16.0, *)
struct QRScannerView: UIViewControllerRepresentable {
    let onCode: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.qr])],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: true,
            isHighlightingEnabled: true
        )
        scanner.delegate = context.coordinator
        return scanner
    }

    func updateUIViewController(_ viewController: DataScannerViewController, context: Context) {
        DispatchQueue.main.async {
            guard DataScannerViewController.isSupported,
                  DataScannerViewController.isAvailable,
                  !viewController.isScanning else { return }
            try? viewController.startScanning()
        }
    }

    static func dismantleUIViewController(_ viewController: DataScannerViewController, coordinator: Coordinator) {
        viewController.stopScanning()
    }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        private let onCode: (String) -> Void
        private var hasDeliveredCode = false

        init(onCode: @escaping (String) -> Void) { self.onCode = onCode }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            deliverFirstCode(from: addedItems, scanner: dataScanner)
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didTapOn item: RecognizedItem) {
            deliverFirstCode(from: [item], scanner: dataScanner)
        }

        private func deliverFirstCode(from items: [RecognizedItem], scanner: DataScannerViewController) {
            guard !hasDeliveredCode else { return }
            for item in items {
                guard case .barcode(let barcode) = item,
                      let value = barcode.payloadStringValue,
                      !value.isEmpty else { continue }
                hasDeliveredCode = true
                onCode(value)
                scanner.stopScanning()
                return
            }
        }
    }
}
