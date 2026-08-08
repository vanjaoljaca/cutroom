describe("project titles", () => {
  it("humanizes legacy camera names without snake case", () => {
    expect(displayProjectTitle("IMG_9340")).toBe("IMG 9340");
  });

  it("keeps export names readable and filesystem safe", () => {
    expect(exportProjectTitle("Motte: claim / response")).toBe("Motte claim response");
  });
});

import { displayProjectTitle, exportProjectTitle } from "./ProjectTitle";
