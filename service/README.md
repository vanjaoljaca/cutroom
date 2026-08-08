# Cutroom local services

Cutroom uses two named macOS services:

- `com.vanja.cutroom` owns the editor/API at `127.0.0.1:4173`.
- `com.vanja.cutroom-host` owns the loopback HTTP entrypoint at `127.0.0.1:80` and proxies it to Cutroom.

The app-owned `Cutroom` launcher gives the user service a recognizable identity instead of a generic Node or shell process. The host is compiled from `CutroomHost.swift` into a root-owned native `Cutroom Host` executable so the port-80 service never runs a user-writable interpreter with elevated privileges. Both runtimes write structured JSON service logs.

`/etc/hosts` maps `capcut` to `127.0.0.1`, making canonical project links available at `http://capcut/project/<id>`.
