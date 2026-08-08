describe("director track interpretation", () => {
  it("selects a retry and follows opening/final scene ordering", () => {
    const transcript = makeTranscript([
      ["The", "first", "scene", "will", "be", "|", "alpha."],
      ["Let", "me", "try", "that", "again."],
      ["alpha", "take", "two."],
      ["The", "opening", "scene", "will", "actually", "be", "|", "open", "now."],
      ["The", "final", "scene", "will", "be", "|", "finish", "now."],
    ]);
    const result = interpretDirectorTrack(transcript, 30);
    expect(result.scenes.map((scene) => [scene.label, scene.takes.length])).toEqual([["Opening", 1], ["First scene", 2], ["Final scene", 1]]);
    expect(result.cuts[1].transcript).toBe("alpha take two.");
    expect(result.cuts[1]).toMatchObject({ sceneOrder: 2, takeOrder: 2 });
    expect(result.scenes[1].takes.map((take) => take.selected)).toEqual([false, true]);
  });

  it("does not invent cuts without explicit direction", () => {
    const result = interpretDirectorTrack(makeTranscript([["ordinary", "conversation."]]), 8);
    expect(result.cuts).toEqual([]);
  });
});

function makeTranscript(rows: string[][]) {
  let time = 0;
  const wordTimings = rows.flatMap((row) => row.flatMap((word) => {
    if (word === "|") { time += 1.2; return []; }
    const timing = { word, startTime: time, endTime: time + 0.2, confidence: 0.99 };
    time += 0.24;
    return [timing];
  }));
  return { text: wordTimings.map((word) => word.word).join(" "), wordTimings };
}

import { interpretDirectorTrack } from "./director-analysis";
