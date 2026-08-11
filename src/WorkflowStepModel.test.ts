describe("workflowViewForRoute", () => {
  it("opens recording routes at the recording-to-projects step", () => {
    expect(workflowViewForRoute("raw.source")).toEqual({ mode: "original", step: "projects" });
  });

  it("opens project routes at their first project-specific step", () => {
    expect(workflowViewForRoute(null)).toEqual({ mode: "original", step: "original" });
  });
});

import { workflowViewForRoute } from "./WorkflowStepModel";
import { describe, expect, it } from "vitest";
