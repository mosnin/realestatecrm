import XCTest
@testable import Chippi

final class NavigationPolicyTests: XCTestCase {
    func testProductionRequiresExactOrigin() {
        let policy = NavigationPolicy(environment: [:])
        XCTAssertTrue(policy.isInternal(URL(string: "https://usechippi.com/s/team/deals")!))
        XCTAssertTrue(policy.isInternal(URL(string: "https://www.usechippi.com/s/team/deals")!))
        for value in ["https://usechippi.com.evil.test", "http://usechippi.com", "https://usechippi.com:444", "https://evil.test"] {
            XCTAssertFalse(policy.isInternal(URL(string: value)!))
        }
    }
    func testUnsafePreviewOverridesFallBackToProduction() {
        for value in ["javascript:alert(1)", "http://evil.test", "file:///etc/passwd", "https://user:password@usechippi.com"] {
            XCTAssertEqual(NavigationPolicy(environment: ["CHIPPI_APP_URL": value]).home, NavigationPolicy.production)
        }
        XCTAssertEqual(NavigationPolicy(environment: ["CHIPPI_APP_URL": "http://localhost:3037/s/preview/chippi/brief"]).home.host, "localhost")
    }
    func testExternalSchemesAreRestricted() {
        let policy = NavigationPolicy(environment: [:])
        XCTAssertTrue(policy.canOpenExternally(URL(string: "mailto:agent@example.com")!))
        XCTAssertFalse(policy.canOpenExternally(URL(string: "file:///etc/passwd")!))
        XCTAssertFalse(policy.canOpenExternally(URL(string: "javascript:alert(1)")!))
    }
}
