import SwiftUI
import WebKit
import UniformTypeIdentifiers

@main
struct ChippiApp: App {
    @StateObject private var browser = CRMWebSession()
    var body: some Scene {
        WindowGroup("Chippi", id: "workspace") {
            WorkspaceView(browser: browser)
                .frame(minWidth: 800, minHeight: 600)
        }
        .defaultSize(width: 1360, height: 900)
        .commands {
            CommandGroup(replacing: .newItem) {}
            CommandGroup(after: .toolbar) {
                Button("Back") { browser.webView.goBack() }.keyboardShortcut("[", modifiers: .command)
                Button("Forward") { browser.webView.goForward() }.keyboardShortcut("]", modifiers: .command)
                Button("Reload") { browser.reload() }.keyboardShortcut("r", modifiers: .command)
                Button("Open in Browser") { browser.openInBrowser() }.keyboardShortcut("o", modifiers: [.command, .shift])
            }
        }
    }
}

struct WorkspaceView: View {
    @ObservedObject var browser: CRMWebSession
    var body: some View {
        ZStack(alignment: .top) {
            CRMWebView(webView: browser.webView)
            if browser.loading { ProgressView().progressViewStyle(.linear).tint(.orange) }
            if let error = browser.error {
                VStack(spacing: 16) {
                    Image(systemName: "wifi.exclamationmark").font(.system(size: 32)).foregroundStyle(.secondary)
                    Text("Chippi couldn’t connect").font(.title2.weight(.semibold))
                    Text(error).foregroundStyle(.secondary).multilineTextAlignment(.center).frame(maxWidth: 420)
                    HStack {
                        Button("Try again") { browser.reload() }.keyboardShortcut(.defaultAction)
                        Button("Open in Browser") { browser.openInBrowser() }
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(.background)
            }
        }
        .toolbar {
            ToolbarItemGroup(placement: .navigation) {
                Button { browser.webView.goBack() } label: { Image(systemName: "chevron.left") }
                    .disabled(!browser.canGoBack).help("Back (⌘[)")
                Button { browser.webView.goForward() } label: { Image(systemName: "chevron.right") }
                    .disabled(!browser.canGoForward).help("Forward (⌘])")
            }
            ToolbarItemGroup(placement: .primaryAction) {
                Button { browser.reload() } label: { Image(systemName: "arrow.clockwise") }.help("Reload (⌘R)")
                Button { browser.openInBrowser() } label: { Image(systemName: "safari") }.help("Open in Browser")
            }
        }
    }
}

struct CRMWebView: NSViewRepresentable {
    let webView: WKWebView
    func makeNSView(context: Context) -> WKWebView { webView }
    func updateNSView(_ nsView: WKWebView, context: Context) {}
}

@MainActor
final class CRMWebSession: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    let policy = NavigationPolicy()
    let webView: WKWebView
    @Published var loading = true
    @Published var error: String?
    @Published var canGoBack = false
    @Published var canGoForward = false
    private var popups: [NSWindow] = []
    private var observations: [NSKeyValueObservation] = []
    private var lastInternalURL: URL?

    override init() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        for keyPath in [\WKWebView.canGoBack, \WKWebView.canGoForward] {
            observations.append(webView.observe(keyPath, options: [.new]) { [weak self] _, _ in
                Task { @MainActor in
                    guard let self else { return }
                    self.canGoBack = self.webView.canGoBack
                    self.canGoForward = self.webView.canGoForward
                }
            })
        }
        webView.load(URLRequest(url: policy.home))
    }

    func reload() {
        error = nil
        // Reload can be a no-op after an initial provisional navigation failure.
        webView.load(URLRequest(url: lastInternalURL ?? policy.home))
    }
    func openInBrowser() {
        let url = webView.url.flatMap { policy.canOpenExternally($0) ? $0 : nil } ?? policy.home
        NSWorkspace.shared.open(url)
    }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        if webView === self.webView { error = nil; loading = true }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if webView === self.webView {
            loading = false
            if let url = webView.url, policy.isInternal(url) { lastInternalURL = url }
        }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(webView, error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(webView, error) }
    private func failed(_ view: WKWebView, _ failure: Error) {
        guard view === webView, (failure as NSError).code != NSURLErrorCancelled else { return }
        loading = false
        error = "Check your internet connection and try again. Your workspace is saved online."
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if webView === self.webView { loading = false; error = "The workspace stopped responding. Reload to reconnect." }
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if action.shouldPerformDownload { decisionHandler(.download); return }
        if url.scheme == "https" || policy.isInternal(url) || url.absoluteString == "about:blank" || url.scheme == "blob" {
            // Explicit external links open in the default browser. Redirects and
            // OAuth popup flows stay in WebKit, retaining their session context.
            if action.navigationType == .linkActivated && action.targetFrame?.isMainFrame == true && !policy.isInternal(url) && policy.canOpenExternally(url) && webView === self.webView {
                NSWorkspace.shared.open(url)
                decisionHandler(.cancel)
            } else { decisionHandler(.allow) }
        } else {
            if action.navigationType == .linkActivated && policy.canOpenExternally(url) { NSWorkspace.shared.open(url) }
            decisionHandler(.cancel)
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping @MainActor @Sendable (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(response.canShowMIMEType ? .allow : .download)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard action.targetFrame == nil else { return nil }
        let popup = WKWebView(frame: .zero, configuration: configuration)
        popup.navigationDelegate = self
        popup.uiDelegate = self
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 640, height: 760), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        window.title = "Chippi · Sign in or connected service"
        window.isReleasedWhenClosed = false
        window.contentView = popup
        window.center()
        window.makeKeyAndOrderFront(nil)
        popups.removeAll { !$0.isVisible }
        popups.append(window)
        return popup
    }
    func webViewDidClose(_ webView: WKWebView) {
        popups.first { $0.contentView === webView }?.close()
        popups.removeAll { !$0.isVisible }
    }
    private func dialog(_ message: String, origin: WKSecurityOrigin) -> NSAlert {
        let alert = NSAlert()
        alert.messageText = origin.host.isEmpty ? "Chippi" : origin.host
        alert.informativeText = message
        return alert
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor @Sendable () -> Void) {
        let alert = dialog(message, origin: frame.securityOrigin)
        alert.addButton(withTitle: "OK")
        alert.runModal()
        completionHandler()
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor @Sendable (Bool) -> Void) {
        let alert = dialog(message, origin: frame.securityOrigin)
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor @Sendable (String?) -> Void) {
        let alert = dialog(prompt, origin: frame.securityOrigin)
        let input = NSTextField(string: defaultText ?? "")
        input.frame = NSRect(x: 0, y: 0, width: 320, height: 24)
        alert.accessoryView = input
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        completionHandler(alert.runModal() == .alertFirstButtonReturn ? input.stringValue : nil)
    }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor @Sendable ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.begin { response in completionHandler(response == .OK ? panel.urls : nil) }
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping @MainActor @Sendable (URL?) -> Void) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = URL(fileURLWithPath: suggestedFilename).lastPathComponent
        panel.begin { result in completionHandler(result == .OK ? panel.url : nil) }
    }
}
