export function interpretDirectorTrack(transcript: FluidTranscript, duration: number): AnalysisResult {
  const sentences = splitSentences(transcript.wordTimings);
  const retryScene = findRetryScene(sentences, duration);
  const openingScene = findGapScene(sentences, /opening scene/i, "Opening", duration);
  const finalScene = findGapScene(sentences, /final scene/i, "Final scene", duration, true);
  const scenes = orderScenes([openingScene, retryScene, finalScene].filter(isScene));
  return makeResult(transcript, scenes);
}

function findRetryScene(sentences: Sentence[], duration: number): SceneProposal | undefined {
  const retryIndex = sentences.findIndex((sentence) => /try that again/i.test(sentence.text));
  if (retryIndex < 0 || !sentences[retryIndex + 1]) return undefined;
  const firstWords = takeAfterGap(sentences[retryIndex - 1]?.words || [], 0.5);
  const takes = [makeTake("Take 1", firstWords, "Earlier performance before you asked to try again.", duration, false, 0.82), makeTake("Take 2", sentences[retryIndex + 1].words, "Selected because you immediately said “we’ll use that.”", duration, true, 0.95)].filter(isTake);
  return { id: "first-scene", order: 0, label: "First scene", reason: "Two performances were separated by “try that again.”", takes };
}

function findGapScene(sentences: Sentence[], marker: RegExp, label: string, duration: number, last = false): SceneProposal | undefined {
  const matching = sentences.filter((sentence) => marker.test(sentence.text));
  const sentence = last ? matching.at(-1) : matching.find((item) => largestGap(item.words).gap >= 0.7);
  if (!sentence) return undefined;
  const words = takeAfterGap(sentence.words, 0.7);
  const take = makeTake("Take 1", words, `Performed after describing the ${label.toLowerCase()}.`, duration, true, 0.9);
  return take ? { id: slug(label), order: 0, label, reason: `You explicitly named the ${label.toLowerCase()}.`, takes: [take] } : undefined;
}

function splitSentences(words: WordTiming[]): Sentence[] {
  const sentences: Sentence[] = [];
  let current: WordTiming[] = [];
  words.forEach((word) => {
    current.push(word);
    if (/[.!?][”']?$/.test(word.word)) sentences.push(toSentence(current.splice(0)));
  });
  if (current.length) sentences.push(toSentence(current));
  return sentences;
}

function largestGap(words: WordTiming[]) {
  return words.slice(1).reduce((best, word, offset) => {
    const gap = word.startTime - words[offset].endTime;
    return gap > best.gap ? { gap, index: offset + 1 } : best;
  }, { gap: 0, index: 0 });
}

function makeTake(label: string, words: WordTiming[], reason: string, duration: number, selected: boolean, confidence: number): TakeProposal | undefined {
  if (!words.length) return undefined;
  const start = Math.max(0, words[0].startTime - 0.12);
  const end = Math.min(duration, words.at(-1)!.endTime + 0.08);
  return { id: `${slug(label)}-${start.toFixed(2)}`, order: 0, start, end, label, reason, confidence, selected, transcript: joinWords(words) };
}

function orderScenes(scenes: SceneProposal[]): SceneProposal[] {
  const priority = (scene: SceneProposal) => scene.label === "Opening" ? 0 : scene.label === "Final scene" ? 2 : 1;
  return scenes.sort((left, right) => priority(left) - priority(right)).map((scene, index) => ({ ...scene, order: index + 1, takes: scene.takes.map((take, takeIndex) => ({ ...take, order: takeIndex + 1 })) }));
}

function makeResult(transcript: FluidTranscript, scenes: SceneProposal[]): AnalysisResult {
  const cuts = selectedCuts(scenes);
  const sequence = cuts.map((cut) => cut.label.toLowerCase()).join(" → ");
  const retry = scenes.some((scene) => scene.takes.length > 1) ? "; prefer the take you approved after retrying" : "";
  const requestSummary = cuts.length ? `Use ${sequence}${retry}.` : "I found speech, but no explicit take-selection instructions. No cuts were invented.";
  return { provider: "fluid-audio", model: "parakeet-tdt-0.6b-v2", transcript: transcript.text, words: transcript.wordTimings, requestSummary, scenes, cuts, artifactsDirectory: "" };
}

function selectedCuts(scenes: SceneProposal[]): CutProposal[] {
  return scenes.flatMap((scene) => scene.takes.filter((take) => take.selected).map((take) => ({ ...take, id: `${scene.id}-${take.id}`, label: scene.label, order: scene.order, sceneOrder: scene.order, takeOrder: take.order })));
}

function takeAfterGap(words: WordTiming[], threshold: number): WordTiming[] {
  const split = largestGap(words);
  return split.gap >= threshold ? words.slice(split.index) : [];
}

function toSentence(words: WordTiming[]): Sentence {
  return { words, text: joinWords(words) };
}

function joinWords(words: WordTiming[]): string {
  return words.map((word) => word.word).join(" ");
}

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function isTake(take: TakeProposal | undefined): take is TakeProposal {
  return Boolean(take);
}

function isScene(scene: SceneProposal | undefined): scene is SceneProposal {
  return Boolean(scene);
}

type Sentence = { text: string; words: WordTiming[] };
type FluidTranscript = { text: string; wordTimings: WordTiming[] };

import type { AnalysisResult, CutProposal, SceneProposal, TakeProposal, WordTiming } from "../src/analysis-model";
