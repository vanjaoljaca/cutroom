final class CutroomSupervisor {
    func run() {
        installSignals()
        queue.async { self.startChild() }
        log("supervisor_started", ["pid": ProcessInfo.processInfo.processIdentifier, "supportRoot": supportRoot.path])
        dispatchMain()
    }

    private func startChild() {
        let release = currentRelease.resolvingSymlinksInPath()
        let child = Process()
        child.executableURL = URL(fileURLWithPath: nodePath)
        child.arguments = [release.appendingPathComponent("server/CutroomServer.mjs").path]
        child.currentDirectoryURL = release
        child.environment = childEnvironment(release)
        child.standardOutput = FileHandle.standardOutput
        child.standardError = FileHandle.standardError
        child.terminationHandler = { [weak self] process in self?.queue.async { self?.childStopped(process) } }
        do { try child.run(); process = child; log("child_started", ["childPid": child.processIdentifier, "sourceRevision": release.lastPathComponent]) }
        catch { fail("child_start_failed", error) }
    }

    private func childStopped(_ child: Process) {
        guard process === child else { return }
        process = nil
        log("child_stopped", ["childPid": child.processIdentifier, "status": child.terminationStatus, "restart": !stopping])
        if stopping { exit(0) }
        queue.asyncAfter(deadline: .now() + .milliseconds(250)) { self.startChild() }
    }

    private func restartChild() {
        log("release_switch_requested", ["childPid": process?.processIdentifier ?? 0])
        process?.terminate()
        if process == nil { startChild() }
    }

    private func stop() {
        stopping = true
        log("supervisor_stopping", ["childPid": process?.processIdentifier ?? 0])
        process?.terminate()
        if process == nil { exit(0) }
    }

    private func installSignals() {
        signal(SIGHUP, SIG_IGN); signal(SIGTERM, SIG_IGN); signal(SIGINT, SIG_IGN)
        signals = [(SIGHUP, { self.restartChild() }), (SIGTERM, { self.stop() }), (SIGINT, { self.stop() })].map { number, action in
            let source = DispatchSource.makeSignalSource(signal: number, queue: queue)
            source.setEventHandler(handler: action); source.resume(); return source
        }
    }

    private func childEnvironment(_ release: URL) -> [String: String] {
        var result = ProcessInfo.processInfo.environment
        result["CUTROOM_SOURCE_REVISION"] = release.lastPathComponent
        result["CUTROOM_RUNTIME_ROOT"] = runtimeRoot
        return result
    }

    private func fail(_ event: String, _ error: Error) {
        log(event, ["error": error.localizedDescription]); exit(1)
    }

    private let queue = DispatchQueue(label: "com.vanja.cutroom.supervisor")
    private var process: Process?
    private var signals: [DispatchSourceSignal] = []
    private var stopping = false
    private let supportRoot = URL(fileURLWithPath: ProcessInfo.processInfo.environment["CUTROOM_SUPPORT_ROOT"] ?? "")
    private var currentRelease: URL { supportRoot.appendingPathComponent("runtime/current") }
    private let nodePath = ProcessInfo.processInfo.environment["CUTROOM_NODE_PATH"] ?? "/opt/homebrew/bin/node"
    private let runtimeRoot = ProcessInfo.processInfo.environment["CUTROOM_RUNTIME_ROOT"] ?? "/Volumes/VanjaOljacaX/Cutroom"
}

func log(_ event: String, _ details: [String: Any]) {
    let base: [String: Any] = ["scope": "com.vanja.cutroom", "service": "Cutroom", "event": event]
    let record = base.merging(details) { _, latest in latest }
    guard let data = try? JSONSerialization.data(withJSONObject: record), let line = String(data: data, encoding: .utf8) else { return }
    print(line); fflush(stdout)
}

CutroomSupervisor().run()

import Darwin
import Dispatch
import Foundation
