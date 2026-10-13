import XCTest
import UIKit
import ImageIO

@MainActor
final class Screenshots: XCTestCase {
    let app = XCUIApplication(bundleIdentifier: "com.daydial.app")

    func control(_ text: String, contains: Bool = false) -> XCUIElement {
        let predicate = NSPredicate(format: contains ? "label CONTAINS[c] %@" : "label ==[c] %@ OR identifier == %@", argumentArray: contains ? [text] : [text, text])
        let button = app.buttons.matching(predicate).firstMatch
        if button.exists { return button }
        if contains {
            let textElement = app.staticTexts.matching(predicate).firstMatch
            if textElement.exists { return textElement }
        }
        return app.descendants(matching: .any).matching(predicate).firstMatch
    }
    func tap(_ text: String, contains: Bool = false) {
        let element = control(text, contains: contains)
        XCTAssertTrue(element.waitForExistence(timeout: 15), "Missing control: \(text)\n\(app.debugDescription)")
        element.tap()
    }
    func dismissHints() {
        for text in ["Not now", "Dismiss tip"] {
            let element = control(text)
            if element.waitForExistence(timeout: 2) && element.isHittable { element.tap() }
        }
    }
    func capture(_ name: String) throws {
        XCTAssertTrue(app.webViews.firstMatch.exists, "Native WebView must be present")
        RunLoop.current.run(until: Date().addingTimeInterval(1))
        let family = UIDevice.current.userInterfaceIdiom == .pad ? "ipad" : "iphone"
        let screenshot = XCUIScreen.main.screenshot()
        // Encode source pixels directly. UIImage's point/scale conversion lost
        // one pixel in the first capture; never resize a native capture to fit.
        let source = try XCTUnwrap(CGImageSourceCreateWithData(screenshot.pngRepresentation as CFData, nil))
        let pixels = try XCTUnwrap(CGImageSourceCreateImageAtIndex(source, 0, nil))
        let bytes = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(bytes, "public.jpeg" as CFString, 1, nil))
        CGImageDestinationAddImage(destination, pixels, [kCGImageDestinationLossyCompressionQuality: 1.0] as CFDictionary)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        print("Native capture \(name): \(pixels.width)x\(pixels.height)")
        let attachment = XCTAttachment(data: bytes as Data, uniformTypeIdentifier: "public.jpeg")
        attachment.name = "arcelira-\(family)-\(name)"
        attachment.lifetime = .keepAlways
        add(attachment)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = "ui-\(family)-\(name)"
        tree.lifetime = .keepAlways
        add(tree)
    }
    func chooseTimeFormat(_ value: String) {
        // WKWebView exposes both a non-interactive text label and the select.
        // The observed native select is an Other element with a current value.
        let select = app.otherElements.matching(NSPredicate(format: "label == %@ AND value == %@", "Time format", "24-hour")).firstMatch
        XCTAssertTrue(select.waitForExistence(timeout: 15), app.debugDescription)
        select.tap()
        let wheel = app.pickerWheels.firstMatch
        if wheel.waitForExistence(timeout: 3) {
            wheel.adjust(toPickerWheelValue: value)
            let done = app.toolbars.buttons["Done"].firstMatch
            if done.exists { done.tap() } else { tap("Done") }
        } else { tap(value) }
    }
    func testStoreScreenshots() throws {
        continueAfterFailure = false
        app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 30))
        tap("24-hour", contains: true)
        tap("Done")
        XCTAssertTrue(control("Clock").waitForExistence(timeout: 15))
        dismissHints()
        try capture("01-day-24h")
        tap("More options")
        tap("Settings")
        XCTAssertTrue(control("Appearance").waitForExistence(timeout: 15), app.debugDescription)
        try capture("02-settings")
        chooseTimeFormat("12-hour")
        tap("Back")
        tap("Morning (AM)")
        dismissHints()
        try capture("03-morning-12h")
        tap("Evening (PM)")
        try capture("04-evening-12h")
        tap("Agenda")
        XCTAssertTrue(control("Standup").waitForExistence(timeout: 15))
        try capture("05-agenda")
        tap("New event")
        let title = app.textFields["Event title"]
        XCTAssertTrue(title.waitForExistence(timeout: 15), app.debugDescription)
        title.tap()
        title.typeText("Focus session")
        tap("Save event")
        XCTAssertTrue(control("How should this reminder arrive?").waitForExistence(timeout: 15))
        try capture("06-reminder-choice")
        // Leave without scheduling a test alarm or saving another event.
        tap("Cancel")
        app.terminate()
    }
}
