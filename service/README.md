# Cutroom local services

Cutroom uses two named macOS services:

- `com.vanja.cutroom` owns the editor/API at `127.0.0.1:4173`.
- `com.vanja.cutroom-host` owns the dedicated IPv6 loopback HTTP entrypoint at `[::1]:80` and proxies it to Cutroom without conflicting with Workbench Master on `127.0.0.1:80`.

The app-owned native `Cutroom` supervisor is installed once at a stable Application Support path. Its launchd plist never includes a source revision or release path. `npm run service:update` stages a versioned release, atomically switches `runtime/current`, and sends `SIGHUP` to the existing supervisor, which restarts only its Node child. Ordinary updates do not rewrite, boot out, or bootstrap the Login Item.

The Node child owns both the editor/API at `127.0.0.1:4173` and the same-Wi-Fi phone review. It advertises `http://cutroom.local/` through Bonjour and routes that Host header through the existing port-80 Cutroom host to the full-viewport vertical swipe feed. The machine's `en0` address on port `4174` remains a diagnostic fallback. Review media comes from the latest dated manifest below `/Volumes/VanjaOljacaX/Cutroom/reviews`, supports byte ranges, and contains no localhost media URLs.

The host is compiled from `CutroomHost.swift` into a root-owned native `Cutroom Host` executable so the port-80 service never runs a user-writable interpreter with elevated privileges. Both runtimes write structured JSON service logs.

`/etc/hosts` maps `cutroom` to `::1`, making canonical project links available at `http://cutroom/project/<id>`.
