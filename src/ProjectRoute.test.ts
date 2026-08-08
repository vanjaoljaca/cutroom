describe("project routes", () => {
  it("reads canonical project paths", () => {
    expect(projectIdFromLocation("/project/img-9340-123", "")).toBe("img-9340-123");
    expect(projectIdFromLocation("/project/my%20cut", "")).toBe("my cut");
  });

  it("migrates legacy query links without overriding a canonical path", () => {
    expect(legacyProjectRedirect("/", "?project=img-9340-123")).toBe("/project/img-9340-123");
    expect(legacyProjectRedirect("/project/current", "?project=legacy")).toBeNull();
  });

  it("builds stable local project URLs", () => {
    expect(canonicalProjectPath("my cut")).toBe("/project/my%20cut");
    expect(projectWebUrl("img-9340-123")).toBe("http://capcut/project/img-9340-123");
  });
});

import { canonicalProjectPath, legacyProjectRedirect, projectIdFromLocation, projectWebUrl } from "./ProjectRoute";
