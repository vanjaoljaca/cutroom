import { describe, expect, it } from "vitest";
import { stablePlist, updatePlan, type ServiceConfig } from "./CutroomServiceLifecycle";
describe("CutroomServiceLifecycle", () => {
  it("keeps release identity out of the durable plist", () => { const plist = stablePlist(config); expect(plist).toContain("/Support/bin/Cutroom"); expect(plist).not.toContain("revision"); expect(plist).not.toContain("runtime/releases"); });
  it("reloads only the child for consecutive normal updates", () => { const plist = stablePlist(config); expect(updatePlan(plist, plist, true)).toEqual({ plistChanged: false, launchAction: "reload-child" }); expect(updatePlan(plist, plist, true)).toEqual({ plistChanged: false, launchAction: "reload-child" }); });
  it("bootstraps once and migrates only changed configuration", () => { const plist = stablePlist(config); expect(updatePlan(null, plist, false).launchAction).toBe("bootstrap"); expect(updatePlan(plist.replace("/Support/bin/Cutroom", "/Legacy/Cutroom"), plist, true).launchAction).toBe("migrate"); });
});
const config: ServiceConfig = { label: "com.vanja.cutroom", executable: "/Support/bin/Cutroom", supportRoot: "/Support", runtimeRoot: "/Volumes/Cutroom", nodePath: "/opt/homebrew/bin/node", stdoutPath: "/Support/stdout.log", stderrPath: "/Support/stderr.log" };
