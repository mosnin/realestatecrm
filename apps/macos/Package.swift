// swift-tools-version: 6.0
import PackageDescription
let package = Package(
    name: "Chippi",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "Chippi", targets: ["Chippi"])],
    targets: [
        .executableTarget(name: "Chippi"),
        .testTarget(name: "ChippiTests", dependencies: ["Chippi"])
    ]
)
