import Capacitor
import AlarmKit
import Foundation
import SwiftUI

@available(iOS 26.0, *)
private struct ArceliraAlarmMetadata: AlarmMetadata {
    let eventId: String
}

@objc(ArceliraAlarmPlugin)
public class ArceliraAlarmPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ArceliraAlarmPlugin"
    public let jsName = "ArceliraAlarm"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise)
    ]

    // Only this bridge's alarms are reconciled. AlarmKit persists them while
    // the WebView is stopped; UserDefaults keeps their IDs stable across launches.
    private let registryKey = "arcelira.alarmkit.registry.v1"

    @objc public override func checkPermissions(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard #available(iOS 26.0, *) else {
                call.resolve(["supported": false, "alarm": "denied"])
                return
            }
            call.resolve(permissionResult(AlarmManager.shared.authorizationState))
        }
    }

    @objc public override func requestPermissions(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard #available(iOS 26.0, *) else {
                call.resolve(["supported": false, "alarm": "denied"])
                return
            }
            do {
                let state = try await AlarmManager.shared.requestAuthorization()
                call.resolve(permissionResult(state))
            } catch {
                call.reject("Alarm permission could not be requested.", "ALARM_PERMISSION", error)
            }
        }
    }

    @available(iOS 26.0, *)
    private func permissionResult(_ state: AlarmManager.AuthorizationState) -> [String: Any] {
        let value: String
        switch state {
        case .authorized: value = "granted"
        case .denied: value = "denied"
        case .notDetermined: value = "prompt"
        @unknown default: value = "denied"
        }
        return ["supported": true, "alarm": value]
    }

    @objc func sync(_ call: CAPPluginCall) {
        guard let values = call.getArray("alarms", JSObject.self), values.count <= 64 else {
            call.reject("Expected at most 64 alarms.", "ALARM_INPUT")
            return
        }
        Task { @MainActor in
            guard #available(iOS 26.0, *) else {
                if values.isEmpty { call.resolve(["scheduled": 0]) }
                else { call.reject("Event alarms require iOS 26 or later.", "ALARM_UNSUPPORTED") }
                return
            }
            do {
                try await reconcile(values)
                call.resolve(["scheduled": values.count])
            } catch {
                call.reject("Event alarms could not be scheduled: \(error.localizedDescription)", "ALARM_SCHEDULE", error)
            }
        }
    }

    @available(iOS 26.0, *)
    @MainActor
    private func reconcile(_ values: [JSObject]) async throws {
        let manager = AlarmManager.shared
        if !values.isEmpty && manager.authorizationState != .authorized {
            // Background rescheduling must never trigger a permission prompt.
            throw NSError(domain: "ArceliraAlarm", code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Enable Arcelira alarms in iPhone Settings."])
        }
        if values.isEmpty && manager.authorizationState != .authorized { return }

        struct DesiredAlarm {
            let key: String
            let eventId: String
            let title: String
            let fireAt: Double
            var signature: String { "\(eventId)|\(fireAt)|\(title)" }
        }
        let desired: [DesiredAlarm] = try values.map { value in
            guard let key = value["key"] as? String,
                  let eventId = value["eventId"] as? String,
                  let title = value["title"] as? String,
                  let fireAt = value["fireAt"] as? Double,
                  !key.isEmpty, !eventId.isEmpty, !title.isEmpty, fireAt.isFinite else {
                throw NSError(domain: "ArceliraAlarm", code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "Invalid event alarm."])
            }
            return DesiredAlarm(key: key, eventId: eventId, title: title, fireAt: fireAt)
        }
        var registry = UserDefaults.standard.dictionary(forKey: registryKey) as? [String: [String: String]] ?? [:]
        let desiredKeys = Set(desired.map(\.key))
        let existingIds = Set(try manager.alarms.map(\.id))

        for key in Array(registry.keys) where !desiredKeys.contains(key) {
            if let rawId = registry[key]?["id"], let id = UUID(uuidString: rawId), existingIds.contains(id) {
                try manager.cancel(id: id)
            }
            registry.removeValue(forKey: key)
            UserDefaults.standard.set(registry, forKey: registryKey)
        }

        for value in desired {
            let stored = registry[value.key]
            let id = stored.flatMap { $0["id"] }.flatMap { UUID(uuidString: $0) } ?? UUID()
            if stored?["signature"] == value.signature && existingIds.contains(id) { continue }
            // An alarm already stopped by the user must not ring again when
            // the app resumes during the one-minute late-reminder grace window.
            if stored?["fireAt"] == String(value.fireAt),
               value.fireAt <= Date().timeIntervalSince1970 * 1000,
               !existingIds.contains(id) { continue }
            if existingIds.contains(id) { try manager.cancel(id: id) }

            let stop = AlarmButton(text: "Stop", textColor: .white, systemImageName: "stop.circle")
            let presentation = AlarmPresentation(alert: .init(
                title: LocalizedStringResource(stringLiteral: value.title), stopButton: stop))
            let attributes = AlarmAttributes(presentation: presentation,
                metadata: ArceliraAlarmMetadata(eventId: value.eventId), tintColor: Color.cyan)
            // Fixed-date alerts have no countdown: no Live Activity widget is
            // needed. AlarmKit provides the alert and built-in stop action.
            let date = max(Date(timeIntervalSince1970: value.fireAt / 1000), Date().addingTimeInterval(1))
            let configuration = AlarmManager.AlarmConfiguration<ArceliraAlarmMetadata>.alarm(
                schedule: .fixed(date), attributes: attributes, sound: .default)
            _ = try await manager.schedule(id: id, configuration: configuration)
            registry[value.key] = ["id": id.uuidString, "signature": value.signature,
                                   "fireAt": String(value.fireAt)]
            UserDefaults.standard.set(registry, forKey: registryKey)
        }
    }
}
