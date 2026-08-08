let serviceLabel = "com.vanja.cutroom-host"
let environment = ProcessInfo.processInfo.environment
let sourceRevision = environment["CUTROOM_SOURCE_REVISION"] ?? "working-tree"
let listenPort = port(environment["CUTROOM_HOST_PORT"] ?? "80")
let targetPort = port(environment["CUTROOM_TARGET_PORT"] ?? "4173")
let queue = DispatchQueue(label: serviceLabel)

do {
    let listener = try NWListener(using: .tcp, on: listenPort)
    listener.newConnectionHandler = connectToCutroom
    listener.stateUpdateHandler = { state in
        if case .ready = state { log("service_started", ["pid": ProcessInfo.processInfo.processIdentifier, "listenPort": listenPort.rawValue, "targetPort": targetPort.rawValue, "sourceRevision": sourceRevision]) }
        if case .failed(let error) = state { log("service_failed", ["error": error.localizedDescription, "sourceRevision": sourceRevision]); exit(1) }
    }
    listener.start(queue: queue)
    dispatchMain()
} catch {
    log("service_failed", ["error": error.localizedDescription, "sourceRevision": sourceRevision])
    exit(1)
}

func connectToCutroom(_ incoming: NWConnection) {
    let outgoing = NWConnection(host: "127.0.0.1", port: targetPort, using: .tcp)
    outgoing.stateUpdateHandler = { state in
        if case .ready = state { bridge(incoming, outgoing); bridge(outgoing, incoming) }
        if case .failed(let error) = state { log("upstream_failed", ["error": error.localizedDescription]); incoming.cancel(); outgoing.cancel() }
    }
    incoming.start(queue: queue)
    outgoing.start(queue: queue)
}

func bridge(_ source: NWConnection, _ destination: NWConnection) {
    source.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { data, _, complete, error in
        if let error { log("connection_failed", ["error": error.localizedDescription]); source.cancel(); destination.cancel(); return }
        guard let data, !data.isEmpty else { if complete { source.cancel(); destination.cancel() } else { bridge(source, destination) }; return }
        destination.send(content: data, completion: .contentProcessed { sendError in
            if let sendError { log("connection_failed", ["error": sendError.localizedDescription]); source.cancel(); destination.cancel(); return }
            if complete { source.cancel(); destination.cancel() } else { bridge(source, destination) }
        })
    }
}

func port(_ value: String) -> NWEndpoint.Port {
    guard let raw = UInt16(value), let result = NWEndpoint.Port(rawValue: raw) else { fatalError("Invalid port: \(value)") }
    return result
}

func log(_ event: String, _ details: [String: Any]) {
    let record: [String: Any] = ["scope": serviceLabel, "service": serviceLabel, "event": event].merging(details) { _, latest in latest }
    guard let data = try? JSONSerialization.data(withJSONObject: record), let line = String(data: data, encoding: .utf8) else { return }
    print(line); fflush(stdout)
}

import Darwin
import Dispatch
import Foundation
import Network
