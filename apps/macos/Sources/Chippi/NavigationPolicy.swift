import Foundation

struct NavigationPolicy {
    let home: URL
    static let production = URL(string: "https://www.usechippi.com/sign-in")!

    init(environment: [String: String] = ProcessInfo.processInfo.environment) {
        // Preview overrides are developer-only and never read from remote content.
        if let value = environment["CHIPPI_APP_URL"], let url = URL(string: value),
           url.user == nil, url.password == nil,
           url.scheme == "https" || (url.scheme == "http" && ["localhost", "127.0.0.1"].contains(url.host ?? "")) {
            home = url
        } else { home = Self.production }
    }

    func isInternal(_ url: URL) -> Bool {
        let hosts = ["usechippi.com", "www.usechippi.com"]
        let sameHost = url.host == home.host || (hosts.contains(home.host ?? "") && hosts.contains(url.host ?? ""))
        return url.scheme == home.scheme && sameHost && url.port == home.port
    }

    func canOpenExternally(_ url: URL) -> Bool {
        ["https", "mailto", "tel"].contains(url.scheme?.lowercased() ?? "")
    }
}
