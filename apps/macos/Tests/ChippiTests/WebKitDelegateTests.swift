import XCTest
@testable import Chippi

final class WebKitDelegateTests: XCTestCase {
    @MainActor
    func testWebKitCanDispatchConfirmationDialogs() {
        let selector = NSSelectorFromString("webView:runJavaScriptConfirmPanelWithMessage:initiatedByFrame:completionHandler:")
        XCTAssertTrue(CRMWebSession.instancesRespond(to: selector))
    }
}
