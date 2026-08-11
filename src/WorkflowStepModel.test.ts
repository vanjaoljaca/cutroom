describe("initialWorkflowView", () => {
  it("opens every project at the recording-to-projects step", () => {
    expect(initialWorkflowView).toEqual({ mode: "original", step: "projects" });
  });
});

import { initialWorkflowView } from "./WorkflowStepModel";
import { describe, expect, it } from "vitest";
