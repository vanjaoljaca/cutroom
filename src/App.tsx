const emptySource: SourceState = { name: "", url: "", objectUrl: false };

export function App() {
  const [source, setSource] = useState<SourceState>(emptySource);
  const [project, setProject] = useState<VideoProject | null>(null);
  const [projectError, setProjectError] = useState("");
  const [duration, setDuration] = useState(0);
  const [originalDuration, setOriginalDuration] = useState(0);
  const [ranges, setRanges] = useState<SourceRange[]>([]);
  const [mode, setMode] = useState<ViewMode>("cut");
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("cut");
  const [recordingPreviewId, setRecordingPreviewId] = useState<string | null>(null);
  const [recordingPreviewProject, setRecordingPreviewProject] = useState<VideoProject | null>(null);
  const [recordingOutputProjects, setRecordingOutputProjects] = useState<Record<string, VideoProject>>({});
  const [recordingTakeMenu, setRecordingTakeMenu] = useState<RecordingTakeMenuState | null>(null);
  const [activeRange, setActiveRange] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [pitchVisible, setPitchVisible] = useState(false);
  const [pitchArtifact, setPitchArtifact] = useState<PitchArtifact | null>(null);
  const [pitchStatus, setPitchStatus] = useState<PitchStatus>("idle");
  const [exportStatus, setExportStatus] = useState<ExportJobStatus | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<ProjectSaveStatus>({ state: "saved", revision: 0, error: null });
  const [projectRailOpen, setProjectRailOpen] = useState(() => !projectIdFromLocation(location.pathname, location.search));
  const [sourceBrowserOpen, setSourceBrowserOpen] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedDeletedClipId, setSelectedDeletedClipId] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState(false);
  const [viewDeleted, setViewDeleted] = useState(false);
  const [cutoutStatus, setCutoutStatus] = useState<CutoutJobStatus | null>(null);
  const [takePreview, setTakePreview] = useState<TakePreview | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoCanvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const activeRangeRef = useRef(0);
  const seekingRef = useRef(false);
  const saveQueueRef = useRef<ProjectSaveQueue | null>(null);
  const downloadedExportsRef = useRef(new Set<string>());
  const syncedExportsRef = useRef(new Set<string>());
  const pendingMediaRef = useRef<PendingMediaLoad | null>(null);
  const recordingPreviewRequestRef = useRef(0);
  if (!saveQueueRef.current) saveQueueRef.current = new ProjectSaveQueue(saveProject, setSaveStatus);

  useObjectUrlCleanup(source);
  useVideoPaintSurface(videoRef, videoCanvasRef, source.url);
  useThumbnailExtraction(source.url, duration, setThumbnails);
  useWaveformExtraction(source.url, setWaveform);
  useEffect(() => { void loadRequestedProject().then(applyProject).catch((error) => setProjectError(error instanceof Error ? error.message : "Could not load project.")); }, []);
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") setSelectedOverlayId(null); };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => { handlePageSpace(event, () => { void togglePlayback(); }); };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, [mode, duration, ranges]);
  useEffect(() => monitorExport(project?.id || null, exportStatus, setExportStatus), [project?.id, exportStatus?.jobId, exportStatus?.state]);
  useEffect(() => monitorCutout(project?.id || null, cutoutStatus, applyCutoutStatus), [project?.id, cutoutStatus?.jobId, cutoutStatus?.state]);
  useEffect(() => {
    downloadCompletedExport(project?.id || null, exportStatus, downloadedExportsRef.current);
    void syncCompletedExport(exportStatus);
  }, [project?.id, exportStatus]);
  useEffect(() => {
    if (workflowStep !== "projects" || !project) return;
    let cancelled = false;
    const outputs = recordingPlanForProject(project).outputs.filter((output) => output.status === "ready");
    void Promise.allSettled(outputs.map((output) => loadVideoProject(output.projectId))).then((results) => {
      if (cancelled) return;
      const loaded = Object.fromEntries(results.flatMap((result, index) => result.status === "fulfilled" ? [[outputs[index].id, result.value]] : []));
      setRecordingOutputProjects(loaded);
      logEvent("recording_output_projects_loaded", { projectId: project.id, requested: outputs.length, loaded: Object.keys(loaded).length });
    });
    return () => { cancelled = true; };
  }, [workflowStep, project?.id]);

  const assembledDuration = cutDuration(ranges);
  const playbackProject = workflowStep === "projects" && recordingPreviewProject ? recordingPreviewProject : project;
  const displayRange = Math.min(activeRange, Math.max(0, ranges.length - 1));
  const displayTime = mode === "cut" && ranges.length
    ? cutTimeFromSource(ranges, displayRange, currentTime)
    : currentTime;
  const displayDuration = workflowStep === "projects" ? (mode === "cut" ? assembledDuration : duration) : (mode === "cut" ? assembledDuration : originalDuration);

  function handleMetadata() {
    const nextDuration = videoRef.current?.duration || 0;
    setDuration(nextDuration);
    paintCurrentVideo();
    if (project && source.url === sourceState(project, project.mediaLibrary.primarySourceId).url) setOriginalDuration(nextDuration);
    applyPendingMediaLoad();
    logEvent("video_loaded", { duration: nextDuration, name: source.name });
  }

  function applyPendingMediaLoad() {
    const pending = pendingMediaRef.current;
    const video = videoRef.current;
    if (!pending || !video) return;
    pendingMediaRef.current = null;
    seekOnCurrentSource(pending.time, pending.rangeIndex);
    if (pending.play) video.addEventListener("seeked", () => { void video.play(); }, { once: true });
  }

  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;
    paintCurrentVideo();
    const previewRestart = mode === "original" ? takePreviewRestart(video.currentTime, takePreview) : null;
    if (previewRestart !== null) return restartTakePreview(video, previewRestart);
    setCurrentTime(video.currentTime);
    if (!seekingRef.current && mode === "cut" && ranges.length) advanceCutIfNeeded(video);
  }

  function restartTakePreview(video: HTMLVideoElement, start: number) {
    video.currentTime = start;
    setCurrentTime(start);
  }

  function paintCurrentVideo() {
    try { if (videoRef.current && videoCanvasRef.current) paintVideoFrame(videoRef.current, videoCanvasRef.current); }
    catch (error) { logError("video_surface_direct_paint_failed", error); }
  }

  function advanceCutIfNeeded(video: HTMLVideoElement) {
    const index = activeRangeRef.current;
    const range = ranges[index];
    if (video.currentTime < range.end - 0.04) return;
    if (index < ranges.length - 1) return void playAt(ranges[index + 1].start, index + 1);
    video.pause();
    setPlaying(false);
  }

  function seekTo(time: number, rangeIndex = activeRange) {
    setTakePreview(null);
    if (mode === "cut" && switchMediaSource(rangeIndex, time, false)) return;
    seekOnCurrentSource(time, rangeIndex);
  }

  function seekOnCurrentSource(time: number, rangeIndex: number) {
    seekingRef.current = true;
    if (videoRef.current) videoRef.current.currentTime = time;
    setCurrentTime(time);
    activeRangeRef.current = rangeIndex;
    setActiveRange(rangeIndex);
  }

  function switchMediaSource(rangeIndex: number, time: number, play: boolean) {
    if (mode !== "cut") return false;
    const sourceId = ranges[rangeIndex]?.sourceId || playbackProject?.mediaLibrary.primarySourceId;
    if (!playbackProject || !sourceId || source.url === sourceState(playbackProject, sourceId).url) return false;
    switchToSource(sourceId, time, rangeIndex, play);
    return true;
  }

  function switchToSource(sourceId: string, time: number, rangeIndex: number, play: boolean) {
    if (!playbackProject) return;
    pendingMediaRef.current = { time, rangeIndex, play };
    setCurrentTime(time);
    activeRangeRef.current = rangeIndex;
    setActiveRange(rangeIndex);
    setSource(sourceState(playbackProject, sourceId));
  }

  function switchOrSeek(time: number, rangeIndex: number) {
    if (!switchMediaSource(rangeIndex, time, false)) seekOnCurrentSource(time, rangeIndex);
  }

  function handleSeeked() {
    seekingRef.current = false;
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  }

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    const decision = playbackDecision({ paused: video.paused, mode, currentTime: video.currentTime, duration: displayDuration, activeRange: activeRangeRef.current, ranges });
    if (decision.type === "pause") return video.pause();
    if (decision.type === "replay") return playAt(decision.time, decision.rangeIndex);
    await video.play();
  }

  async function playFromStart() {
    const video = videoRef.current;
    if (!video) return;
    setTakePreview(null);
    const start = mode === "cut" && ranges[0] ? ranges[0].start : 0;
    await playAt(start, 0);
    logEvent("playback_restarted", { mode, sourceTime: start });
  }

  async function playAt(time: number, rangeIndex: number) {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    if (switchMediaSource(rangeIndex, time, true)) return;
    seekOnCurrentSource(time, rangeIndex);
    await waitForSeek(video);
    seekingRef.current = false;
    await video.play();
  }

  function changeMode(nextMode: ViewMode) {
    recordingPreviewRequestRef.current += 1;
    setTakePreview(null);
    setSourceBrowserOpen(false);
    setRecordingPreviewId(null);
    setRecordingPreviewProject(null);
    setRecordingTakeMenu(null);
    setMode(nextMode);
    setWorkflowStep(nextMode);
    const projectRanges = project ? programRanges(project) : ranges;
    setRanges(projectRanges);
    if (nextMode === "cut" && projectRanges.length) seekProjectRange(projectRanges[0]);
    if (nextMode === "original" && project) setRawRecordingPreview(project, 0);
    logEvent("timeline_mode_changed", { mode: nextMode });
  }

  function seekProjectRange(range: SourceRange) {
    const sourceId = range.sourceId || project?.mediaLibrary.primarySourceId;
    if (project && sourceId && source.url !== sourceState(project, sourceId).url) {
      pendingMediaRef.current = { time: range.start, rangeIndex: 0, play: false };
      setSource(sourceState(project, sourceId));
    }
    else seekOnCurrentSource(range.start, 0);
  }

  function showRecordingPlan() {
    recordingPreviewRequestRef.current += 1;
    setTakePreview(null);
    setSourceBrowserOpen(false);
    setWorkflowStep("projects");
    setMode("original");
    setRecordingPreviewId(null);
    setRecordingPreviewProject(null);
    setRecordingTakeMenu(null);
    if (project) setRawRecordingPreview(project, 0);
    logEvent("recording_plan_opened", { projectId: project?.id || "" });
  }

  function previewRecordingSource(time: number) {
    if (!project) return;
    recordingPreviewRequestRef.current += 1;
    videoRef.current?.pause();
    setRecordingPreviewId(null);
    setRecordingPreviewProject(null);
    setRecordingTakeMenu(null);
    setSelectedOverlayId(null);
    setMode("original");
    setRawRecordingPreview(project, time);
    logEvent("recording_viewer_selected", { kind: "raw", projectId: project.id, sourceTime: time });
  }

  async function previewRecordingOutput(output: RecordingPlanOutput, clipId?: string, play = false) {
    if (!project) return;
    const requestId = ++recordingPreviewRequestRef.current;
    videoRef.current?.pause();
    setRecordingPreviewId(output.id);
    setSelectedOverlayId(null);
    try {
      const selectedProject = recordingOutputProjects[output.id] || await loadVideoProject(output.projectId);
      if (requestId !== recordingPreviewRequestRef.current) return;
      const selection = projectRecordingViewer(output, selectedProject);
      const previewRanges = selection.ranges;
      const rangeIndex = Math.max(0, clipId ? previewRanges.findIndex((range) => range.clipId === clipId) : 0);
      const previewRange = previewRanges[rangeIndex] || previewRanges[0];
      const nextSource = sourceState(selectedProject, previewRange.sourceId || selection.sourceId);
      setRecordingOutputProjects((current) => ({ ...current, [output.id]: selectedProject }));
      setRecordingPreviewProject(selectedProject);
      setRanges(previewRanges);
      setMode(selection.mode);
      activateRecordingPreview(nextSource, previewRange.start, rangeIndex, play);
      logEvent("recording_viewer_selected", { kind: selection.kind, hostProjectId: project.id, projectId: selectedProject.id, outputId: output.id, clipId: previewRange.clipId || "", clips: previewRanges.length, duration: selection.duration || 0, play });
      return selectedProject;
    } catch (error) {
      if (requestId !== recordingPreviewRequestRef.current) return;
      setRecordingPreviewId(null);
      setProjectError(error instanceof Error ? error.message : "Could not preview output project.");
      logError("recording_output_preview_failed", error);
      return null;
    }
  }

  function activateRecordingPreview(nextSource: SourceState, time: number, rangeIndex: number, play: boolean) {
    if (source.url !== nextSource.url) {
      pendingMediaRef.current = { time, rangeIndex, play };
      setCurrentTime(time); activeRangeRef.current = rangeIndex; setActiveRange(rangeIndex); setSource(nextSource);
      return;
    }
    seekOnCurrentSource(time, rangeIndex);
    if (play && videoRef.current) void videoRef.current.play().catch((error) => logError("recording_segment_play_failed", error));
  }

  function playRecordingSegment(output: RecordingPlanOutput, clipId: string) {
    setRecordingTakeMenu(null);
    void previewRecordingOutput(output, clipId, true);
  }

  async function openRecordingTakeMenu(output: RecordingPlanOutput, clipId: string, point: MenuPoint) {
    const selectedProject = await previewRecordingOutput(output);
    if (!selectedProject) return;
    setRecordingTakeMenu({ outputId: output.id, clipId, ...point });
    logEvent("recording_take_menu_opened", { projectId: selectedProject.id, outputId: output.id, clipId });
  }

  async function chooseRecordingTake(takeId: string) {
    if (!recordingTakeMenu) return;
    const previewProject = recordingOutputProjects[recordingTakeMenu.outputId] || recordingPreviewProject;
    if (!previewProject) return;
    try {
      const saved = await saveProject(selectProgramTake(previewProject, recordingTakeMenu.clipId, takeId));
      applyRecordingTakeSelection(saved, recordingTakeMenu.outputId, recordingTakeMenu.clipId);
      setRecordingTakeMenu(null);
      logEvent("recording_take_selected", { projectId: saved.id, clipId: recordingTakeMenu.clipId, takeId });
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : "Could not select take.");
      logError("recording_take_selection_failed", error);
    }
  }

  function applyRecordingTakeSelection(saved: VideoProject, outputId: string, clipId: string) {
    const nextRanges = programRanges(saved);
    const rangeIndex = Math.max(0, nextRanges.findIndex((range) => range.clipId === clipId));
    const range = nextRanges[rangeIndex];
    setRecordingOutputProjects((current) => ({ ...current, [outputId]: saved }));
    setRecordingPreviewProject(saved);
    setRanges(nextRanges);
    const nextSource = sourceState(saved, range.sourceId || saved.mediaLibrary.primarySourceId);
    if (source.url === nextSource.url) seekOnCurrentSource(range.start, rangeIndex);
    else { pendingMediaRef.current = { time: range.start, rangeIndex, play: false }; setSource(nextSource); }
  }

  function setRawRecordingPreview(hostProject: VideoProject, time: number) {
    const selection = rawRecordingViewer(hostProject, time);
    pendingMediaRef.current = { time: selection.sourceTime, rangeIndex: 0, play: false };
    setCurrentTime(selection.sourceTime);
    activeRangeRef.current = 0;
    setActiveRange(0);
    setSource(sourceState(hostProject, selection.sourceId));
  }

  function seekFromTimeline(event: MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    seekFromRatio(Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)));
  }

  function seekFromRatio(ratio: number) {
    if (mode === "original") return seekTo(originalDuration * ratio);
    const cutTime = assembledDuration * ratio;
    const location = sourceLocationFromCutTime(ranges, cutTime);
    seekTo(location.sourceTime, location.rangeIndex);
  }

  function applyProject(next: VideoProject | null) {
    if (!next) return;
    const selected = { ...next, cuts: selectedCutsFromScenes(next.scenes) };
    const normalized = normalizeImageOverlayHeights(selected);
    const nextRanges = programRanges(normalized);
    setProject(normalized);
    saveQueueRef.current?.reset(next);
    if (normalized !== selected) saveQueueRef.current?.enqueue(normalized);
    setRanges(nextRanges);
    setSelectedClipId(nextRanges[0]?.id || null);
    const initialStep = nextRanges.length ? "cut" : "projects";
    setMode(nextRanges.length ? "cut" : "original");
    setWorkflowStep(initialStep);
    const first = nextRanges[0];
    pendingMediaRef.current = first ? { time: first.start, rangeIndex: 0, play: false } : null;
    setSource(sourceState(normalized, first?.sourceId || normalized.mediaLibrary.primarySourceId));
    setSelectedOverlayId(null);
    setTakePreview(null);
    setRecordingPreviewId(null);
    setRecordingPreviewProject(null);
    setRecordingOutputProjects({});
    setRecordingTakeMenu(null);
    setCutoutStatus(recoverableCutoutStatus(normalized));
  }

  async function openPitch() {
    setPitchVisible(true);
    if (pitchArtifact || !project) return;
    setPitchStatus(project.pitchAnalysis ? "loading" : "analyzing");
    try {
      setPitchArtifact(await requestPitch(project.id, Boolean(project.pitchAnalysis)));
      setPitchStatus("idle");
    } catch (error) {
      setPitchStatus(project.pitchAnalysis ? "error" : "unavailable");
      logError("pitch_load_failed", error);
    }
  }

  async function startExport(preset: ExportPreset) {
    if (!project) return;
    setExportMenuOpen(false);
    try { setExportStatus(await requestExport(project.id, preset)); }
    catch (error) { setExportStatus(failedExportStatus(project.id, preset, error)); }
  }

  async function cancelExport() {
    if (!project || !exportStatus) return;
    setExportStatus(await cancelExportRequest(project.id, exportStatus.jobId));
  }

  async function syncCompletedExport(status: ExportJobStatus | null) {
    if (status?.state !== "completed" || syncedExportsRef.current.has(status.jobId)) return;
    syncedExportsRef.current.add(status.jobId);
    try {
      const next = await loadRequestedProject();
      if (!next) return;
      const normalized = { ...next, cuts: selectedCutsFromScenes(next.scenes) };
      setProject(normalized);
      setRanges(programRanges(normalized));
      saveQueueRef.current?.reset(normalized);
      setSaveStatus({ state: "saved", revision: normalized.revision, error: null });
    } catch (error) { syncedExportsRef.current.delete(status.jobId); logError("export_project_sync_failed", error); }
  }

  function updateTake(sceneId: string, takeId: string, edge: "start" | "end", value: number) {
    applyTakeTrim(sceneId, takeId, edge, value, true);
    seekTo(value);
  }

  function trimTimelineClip(clipId: string, edge: "start" | "end", value: number, commit: boolean) {
    updateProgramClipTrim(clipId, edge, value, commit);
    seekTo(value);
    if (commit) logEvent("timeline_trim_committed", { clipId, edge, value });
  }

  function applyTakeTrim(sceneId: string, takeId: string, edge: "start" | "end", value: number, persist: boolean) {
    if (!project) return;
    const scenes = project.scenes.map((scene) => scene.id === sceneId ? { ...scene, takes: scene.takes.map((take) => take.id === takeId ? trimTake(take, edge, value, originalDuration) : take) } : scene);
    commitScenes(scenes, persist);
  }

  function changeOverlayTiming(id: string, start: number, end: number, persist: boolean) {
    if (!project) return;
    const overlays = project.overlays.map((overlay) => overlay.id === id ? imageOverlayWithCutInterval(overlay, ranges, start, end) : overlay);
    commitProject({ ...project, overlays }, persist);
  }

  function changeOverlayLayout(id: string, layout: OverlayLayout, persist: boolean) {
    if (!project) return;
    const overlays = project.overlays.map((overlay) => overlay.id === id ? { ...overlay, layout } : overlay);
    commitProject({ ...project, overlays }, persist);
  }

  function changeCutoutTiming(id: string, start: number, end: number, persist: boolean) {
    if (!project) return;
    const cutoutOverlays = project.cutoutOverlays.map((overlay) => overlay.id === id ? cutoutWithProgramInterval(overlay, ranges, start, end) : overlay);
    commitProject({ ...project, cutoutOverlays }, persist);
  }

  function changeCutoutLayout(id: string, layout: OverlayLayout, persist: boolean) {
    if (!project) return;
    const cutoutOverlays = project.cutoutOverlays.map((overlay) => overlay.id === id ? { ...overlay, layout } : overlay);
    commitProject({ ...project, cutoutOverlays }, persist);
  }

  function changeVideoOverlayTiming(id: string, start: number, end: number, persist: boolean) {
    if (!project) return;
    const videoOverlays = project.videoOverlays.map((overlay) => {
      const sourceDuration = project.mediaLibrary.sources.find((source) => source.id === overlay.sourceId)?.metadata?.duration;
      return overlay.id === id ? videoOverlayWithProgramInterval(overlay, ranges, start, end, sourceDuration) : overlay;
    });
    commitProject({ ...project, videoOverlays }, persist);
  }

  function changeVideoOverlayLayout(id: string, layout: OverlayLayout, persist: boolean) {
    if (!project) return;
    const videoOverlays = project.videoOverlays.map((overlay) => overlay.id === id ? { ...overlay, layout } : overlay);
    commitProject({ ...project, videoOverlays }, persist);
  }

  function changeTextOverlayTiming(id: string, start: number, end: number, persist: boolean) {
    if (!project) return;
    const textOverlays = project.textOverlays.map((overlay) => overlay.id === id ? textOverlayWithProgramInterval(overlay, ranges, start, end) : overlay);
    commitProject({ ...project, textOverlays }, persist);
  }

  function updateTextOverlay(next: TextOverlay) {
    if (!project) return;
    commitProject({ ...project, textOverlays: project.textOverlays.map((overlay) => overlay.id === next.id ? next : overlay) }, true);
  }

  function changeTextOverlayPosition(id: string, x: number, y: number, persist: boolean) {
    if (!project) return;
    const textOverlays = project.textOverlays.map((overlay) => overlay.id === id ? { ...overlay, layout: { ...overlay.layout, x, y } } : overlay);
    commitProject({ ...project, textOverlays }, persist);
  }

  async function createSubjectCutout(media: VideoMediaSource, start: number, end: number, targetClipId: string) {
    if (!project) return;
    try { applyCutoutStatus(await requestCutout(project.id, { sourceId: media.id, sourceStart: start, sourceEnd: end, targetClipId, label: `${media.label} cutout` })); }
    catch (error) { setCutoutStatus(failedCutoutStatus(project.id, error)); }
  }

  function applyCutoutStatus(status: CutoutJobStatus) {
    setCutoutStatus(status);
    if (!status.project || status.project.revision === project?.revision) return;
    const normalized = { ...status.project, cuts: selectedCutsFromScenes(status.project.scenes) };
    setProject(normalized);
    setRanges(programRanges(normalized));
    saveQueueRef.current?.reset(normalized);
    setSaveStatus({ state: "saved", revision: normalized.revision, error: null });
  }

  function selectBundleCandidate(bundleId: string, assetId: string) {
    if (!project) return;
    commitProject(selectImageBundleCandidate(project, bundleId, assetId));
    logEvent("image_bundle_candidate_selected", { bundleId, assetId });
  }

  function changeTimelineWindow(timelineWindow: TimelineWindow) {
    if (!project) return;
    commitProject({ ...project, editorPreferences: { ...project.editorPreferences, timelineWindow } });
    logEvent("timeline_window_changed", { timelineWindow });
  }

  function insertSourceIntoProgram(source: VideoMediaSource, start: number, end: number, index: number) {
    if (!project) return;
    const id = `clip.source.${crypto.randomUUID().toLowerCase()}`;
    const clip = sourceProgramClip({ id, sourceId: source.id, label: source.label, sourceStart: start, sourceEnd: end, createdAt: new Date().toISOString() });
    const programTimeline = insertProgramClip(project.programTimeline, clip, index);
    commitProject({ ...project, programTimeline });
    setSelectedClipId(id);
    setMode("cut");
    queueMicrotask(() => switchToSource(source.id, start, index, false));
    logEvent("program_clip_inserted", { clipId: id, sourceId: source.id, index, start, end });
  }

  function replaceSourceInProgram(source: VideoMediaSource, start: number, end: number, clipId: string) {
    if (!project) return;
    const clip = sourceProgramClip({ id: clipId, sourceId: source.id, label: source.label, sourceStart: start, sourceEnd: end, createdAt: new Date().toISOString() });
    const programTimeline = replaceProgramClip(project.programTimeline, clipId, clip);
    commitProject({ ...project, programTimeline });
    const index = Math.max(0, programTimeline.clips.findIndex((item) => item.id === clipId));
    setMode("cut"); queueMicrotask(() => switchToSource(source.id, start, index, false));
    logEvent("program_clip_replaced", { clipId, sourceId: source.id, start, end });
  }

  function removeSelectedProgramClip() {
    if (!project || !selectedClipId) return;
    const clip = project.programTimeline.clips.find((candidate) => candidate.id === selectedClipId);
    if (!clip) return;
    const index = project.programTimeline.clips.findIndex((candidate) => candidate.id === clip.id);
    const programStart = cutDuration(ranges.slice(0, index));
    const editorialState = { overlays: project.overlays, videoOverlays: project.videoOverlays, textOverlays: project.textOverlays };
    const programTimeline = deleteProgramClip(project.programTimeline, clip.id, editorialState, new Date().toISOString());
    const shifted = shiftSelectedCutOverlays(project, programStart, clip.sourceEnd - clip.sourceStart);
    commitProject({ ...shifted, programTimeline });
    setSelectedClipId(programTimeline.clips[Math.min(index, programTimeline.clips.length - 1)]?.id || null);
    setSelectedDeletedClipId(clip.id);
    logEvent("program_clip_removed", { clipId: clip.id });
  }

  function restoreDeletedProgramClip() {
    if (!project || !selectedDeletedClipId) return;
    const deleted = project.programTimeline.deletedClips?.find((item) => item.clip.id === selectedDeletedClipId); if (!deleted) return;
    const programTimeline = restoreProgramClip(project.programTimeline, selectedDeletedClipId);
    commitProject({ ...project, programTimeline, ...deleted.editorialState }); setSelectedClipId(selectedDeletedClipId); setSelectedDeletedClipId(null);
    logEvent("program_clip_restored", { clipId: deleted.clip.id });
  }

  function splitProgramAt(cutTime: number) {
    if (!project) return;
    let before = 0;
    const range = ranges.find((item) => { const end = before + item.end - item.start; const match = cutTime > before + 0.08 && cutTime < end - 0.08; if (!match) before = end; return match; });
    if (!range?.clipId) return;
    const rightId = `clip.split.${crypto.randomUUID().toLowerCase()}`;
    const sourceTime = range.start + cutTime - before;
    const programTimeline = splitProgramClip(project.programTimeline, range.clipId, sourceTime, rightId);
    if (programTimeline === project.programTimeline) return;
    commitProject({ ...project, programTimeline }); setSelectedClipId(rightId); setSelectedDeletedClipId(null);
    logEvent("program_clip_split", { clipId: range.clipId, rightId, sourceTime, cutTime });
  }

  function updateProgramClipTrim(clipId: string, edge: "start" | "end", value: number, persist: boolean) {
    if (!project) return;
    const clip = project.programTimeline.clips.find((candidate) => candidate.id === clipId);
    const programTimeline = trimProgramClip(project.programTimeline, clipId, edge, value);
    const nextClip = programTimeline.clips.find((candidate) => candidate.id === clipId);
    if (!clip || !nextClip) return;
    const scenes = clip.kind === "scene" ? updateSceneTakeInterval(project.scenes, clip, nextClip) : project.scenes;
    commitProject({ ...project, scenes, cuts: selectedCutsFromScenes(scenes), programTimeline }, persist);
  }

  function showOverlay(id: string, cutStart: number) {
    setSelectedOverlayId(id);
    const location = sourceLocationFromCutTime(ranges, Math.min(assembledDuration, cutStart + 0.04));
    seekTo(location.sourceTime, location.rangeIndex);
  }

  function dismissOverlayFromBackground(event: ReactPointerEvent<HTMLElement>) {
    const target = event.target;
    if (target instanceof Element && !target.closest("[data-overlay-editor]")) setSelectedOverlayId(null);
    if (target instanceof Element && !target.closest(".export-control")) setExportMenuOpen(false);
  }

  function selectTake(sceneId: string, takeId: string) {
    if (!project) return;
    const scenes = project.scenes.map((scene) => scene.id === sceneId ? { ...scene, takes: scene.takes.map((take) => ({ ...take, selected: take.id === takeId })) } : scene);
    commitScenes(scenes);
    const sceneIndex = scenes.findIndex((scene) => scene.id === sceneId);
    const selected = scenes[sceneIndex]?.takes.find((take) => take.id === takeId);
    if (selected) void previewSelectedTake(sceneId, selected);
  }

  function previewTake(sceneId: string, takeId: string) {
    const take = project?.scenes.find((scene) => scene.id === sceneId)?.takes.find((candidate) => candidate.id === takeId);
    if (take) void previewSelectedTake(sceneId, take);
  }

  async function previewSelectedTake(sceneId: string, take: TakeProposal) {
    const video = videoRef.current;
    const sourceId = project?.mediaLibrary.primarySourceId;
    if (!video || !sourceId) return;
    video.pause();
    setMode("original");
    setWorkflowStep("original");
    setTakePreview({ sceneId, takeId: take.id, start: take.start, end: take.end });
    if (project && source.url !== sourceState(project, sourceId).url) switchToSource(sourceId, take.start, 0, true);
    else await playTakeOnCurrentSource(video, take.start);
    logEvent("take_preview_started", { sceneId, takeId: take.id, start: take.start, end: take.end });
  }

  async function playTakeOnCurrentSource(video: HTMLVideoElement, start: number) {
    seekOnCurrentSource(start, 0);
    await waitForSeek(video);
    seekingRef.current = false;
    await video.play();
  }

  function commitScenes(next: SceneProposal[], persist = true, baseTimeline = project?.programTimeline) {
    if (!project) return;
    const scenes = next.map((scene, index) => ({ ...scene, order: index + 1 }));
    const programTimeline = scenes.reduce((timeline, scene) => syncSceneClip(timeline, scene), baseTimeline!);
    const updated = { ...project, scenes, cuts: selectedCutsFromScenes(scenes), programTimeline };
    commitProject(updated, persist);
  }

  function commitProject(updated: VideoProject, persist = true) {
    const nextRanges = programRanges(updated);
    const nextRange = Math.min(activeRangeRef.current, Math.max(0, nextRanges.length - 1));
    setProject(updated);
    setRanges(nextRanges);
    activeRangeRef.current = nextRange;
    setActiveRange(nextRange);
    if (persist) saveQueueRef.current?.enqueue(updated);
  }

  function applyRenamedProject(renamed: VideoProject) {
    if (renamed.id !== project?.id) return;
    setProject(renamed);
    saveQueueRef.current?.reset(renamed);
  }

  function applyTrashedProject(receipt: ProjectTrashReceipt) {
    if (receipt.projectId === project?.id) location.assign("/");
  }

  const playhead = displayDuration ? `${(displayTime / displayDuration) * 100}%` : "0%";
  const playerControls = <div className="player-controls">
    <button className="restart-button" aria-label="Play from start" title="Play from start" onClick={playFromStart}><PlayFromStartIcon /></button>
    <button className="play-button" aria-label={playing ? "Pause" : "Play"} onClick={togglePlayback}>{playing ? <Pause size={28} weight="fill" /> : <Play size={28} weight="fill" />}</button>
    <span className="time-readout">{formatTime(displayTime)} / {formatTime(displayDuration)}</span>
  </div>;
  const videoPreview = <aside className="viewer-column" aria-label="Video preview"><div className="viewer" ref={viewerRef}>
    <video className="video-decoder" ref={videoRef} src={source.url} muted={muted} playsInline onLoadedMetadata={handleMetadata} onTimeUpdate={handleTimeUpdate} onSeeked={handleSeeked} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
    <canvas className="video-paint-surface" ref={videoCanvasRef} aria-hidden="true" />
    {project && workflowStep !== "projects" && <EditableOverlayStage project={project} mode={mode} sourceTime={currentTime} cutTime={displayTime} selectedId={selectedOverlayId} onSelect={setSelectedOverlayId} onLayoutChange={changeOverlayLayout} />}
    {project && workflowStep !== "projects" && <CutoutOverlayStage project={project} mode={mode} cutTime={displayTime} playing={playing} selectedId={selectedOverlayId} onSelect={setSelectedOverlayId} onLayoutChange={changeCutoutLayout} />}
    {project && workflowStep !== "projects" && <VideoOverlayStage project={project} mode={mode} cutTime={displayTime} playing={playing} selectedId={selectedOverlayId} onSelect={setSelectedOverlayId} onLayoutChange={changeVideoOverlayLayout} />}
    {project && workflowStep !== "projects" && <TextOverlayStage project={project} mode={mode} cutTime={displayTime} selectedId={selectedOverlayId} onSelect={setSelectedOverlayId} onPositionChange={changeTextOverlayPosition} />}
    {recordingPreviewProject && workflowStep === "projects" && <div className="recording-preview-overlays" inert>
      <EditableOverlayStage project={recordingPreviewProject} mode="cut" sourceTime={currentTime} cutTime={displayTime} selectedId={null} onSelect={ignoreOverlaySelection} onLayoutChange={ignoreOverlayLayout} />
      <CutoutOverlayStage project={recordingPreviewProject} mode="cut" cutTime={displayTime} playing={playing} selectedId={null} onSelect={ignoreOverlaySelection} onLayoutChange={ignoreOverlayLayout} />
      <VideoOverlayStage project={recordingPreviewProject} mode="cut" cutTime={displayTime} playing={playing} selectedId={null} onSelect={ignoreOverlaySelection} onLayoutChange={ignoreOverlayLayout} />
      <TextOverlayStage project={recordingPreviewProject} mode="cut" cutTime={displayTime} selectedId={null} onSelect={ignoreOverlaySelection} onPositionChange={ignoreTextPosition} />
    </div>}
  </div><div className="preview-utility-controls"><button aria-label={muted ? "Unmute" : "Mute"} title={muted ? "Unmute" : "Mute"} onClick={() => setMuted((value) => !value)}>{muted ? <SpeakerSlash size={20} /> : <SpeakerHigh size={20} />}</button><button aria-label="Fullscreen" title="Fullscreen" onClick={() => viewerRef.current?.requestFullscreen()}><ArrowsOut size={20} /></button></div></aside>;

  const projectRail = <ProjectRail open={projectRailOpen} currentProjectId={project?.id || null} onClose={() => setProjectRailOpen(false)} onProjectRenamed={applyRenamedProject} onProjectTrashed={applyTrashedProject} />;
  if (!source.url) return <>{projectRail}<ProjectLanding error={projectError} onOpenProjects={() => setProjectRailOpen(true)} /></>;

  return (
    <><main className="editor-shell" onPointerDown={dismissOverlayFromBackground}>
      <header className="editor-header">
        <div className="header-brand">
          <button className="projects-button" aria-label="Projects" title="Projects" aria-expanded={projectRailOpen} onClick={() => setProjectRailOpen((current) => !current)}><List size={22} weight="bold" /></button>
          <span className="wordmark">Cutroom</span>
          <span className="file-name">{displayProjectTitle(project?.title || source.name)}</span>
        </div>
        <div className="header-actions"><SaveIndicator status={saveStatus} /><div className="export-control"><button className="export-button" aria-label="Export video" title="Export video" aria-expanded={exportMenuOpen} disabled={exportStatus?.state === "queued" || exportStatus?.state === "exporting"} onClick={() => setExportMenuOpen((open) => !open)}><ExportIcon size={18} weight="bold" /></button>{exportMenuOpen && <div className="export-menu" role="menu" aria-label="Export options"><button role="menuitem" onClick={() => startExport("original-format")}><strong>Export original format</strong><span>HEVC · MOV · preserve source / smart render</span></button><button role="menuitem" onClick={() => startExport("tiktok-60")}><strong>Export for TikTok · Hardware</strong><span>Default · VideoToolbox · 1080×1920 · 60 fps</span></button><button role="menuitem" onClick={() => startExport("tiktok-software")}><strong>High-quality software</strong><span>libx264 slow · CRF 14 · same edit and overlays</span></button></div>}<ExportNotice status={exportStatus} onCancel={cancelExport} onRetry={() => startExport(exportStatus?.preset || "original-format")} /></div></div>
      </header>

      <section className={`workspace ${mode} ${workflowStep === "projects" ? "projects-step" : ""}`} aria-label="Video editor">
        <div className="workflow-bar"><nav className="workflow-steps" aria-label="Editing workflow">
            <button aria-label="Split recording into projects" aria-current={workflowStep === "projects" ? "step" : undefined} title="Split recording into projects" className={workflowStep === "projects" ? "active" : ""} onClick={showRecordingPlan}><GitBranch size={16} weight="bold" /></button>
            <ArrowRight size={12} weight="bold" aria-hidden="true" />
            <button aria-label="Select scenes and takes" aria-current={workflowStep === "original" ? "step" : undefined} title="Select scenes and takes" className={workflowStep === "original" ? "active" : ""} onClick={() => changeMode("original")}><ListChecks size={16} weight="bold" /></button>
            <ArrowRight size={12} weight="bold" aria-hidden="true" />
            <button aria-label="Edit timeline" aria-current={workflowStep === "cut" ? "step" : undefined} disabled={!ranges.length} title={ranges.length ? "Edit timeline" : "No cut has been made yet"} className={workflowStep === "cut" ? "active" : ""} onClick={() => changeMode("cut")}><Scissors size={16} weight="bold" /></button>
          </nav></div>
        {workflowStep !== "projects" && !ranges.length && <p className="no-cut-note">No take selected. Ask the video task to revise this project.</p>}
        {projectError && <p className="analysis-error">{projectError}</p>}

        {workflowStep === "projects" && project && <div className="recording-plan-phase"><RecordingSourceTimeline project={project} duration={originalDuration || duration} thumbnails={thumbnails} waveform={waveform} currentTime={recordingPreviewId === null ? currentTime : 0} selected={recordingPreviewId === null} onSeek={previewRecordingSource} onSelect={() => previewRecordingSource(0)} /><div className="recording-plan-workspace"><RecordingPlanPanel project={project} outputProjects={recordingOutputProjects} selectedOutputId={recordingPreviewId} activeClipId={recordingPreviewId ? ranges[displayRange]?.clipId || null : null} onPreview={previewRecordingOutput} onPlaySegment={playRecordingSegment} onTakeMenu={openRecordingTakeMenu} /><div className="recording-preview-column">{videoPreview}{playerControls}</div></div></div>}
        {workflowStep === "original" && <div className="phase-preview original"><div className="selection-phase">{playerControls}{project && <AnalysisPanel project={project} duration={originalDuration} previewTakeId={takePreview?.takeId || null} onSeek={seekTo} onUpdate={updateTake} onSelect={selectTake} onPreview={previewTake} />}</div>{videoPreview}</div>}
        {workflowStep === "cut" && <><div className="phase-preview cut">{videoPreview}</div><div className="edit-phase">{playerControls}
          <Timeline
          project={project}
          mode={mode}
          duration={originalDuration}
          ranges={ranges}
          thumbnails={thumbnails}
          waveform={waveform}
          playhead={playhead}
          onViewPitch={openPitch}
          addMediaOpen={sourceBrowserOpen}
          onAddMedia={() => setSourceBrowserOpen(true)}
          onSeek={seekFromTimeline}
          onTrim={trimTimelineClip}
          selectedOverlayId={selectedOverlayId}
          onSelectOverlay={showOverlay}
          onOverlayTimingChange={changeOverlayTiming}
          onCandidateSelect={selectBundleCandidate}
          onCutoutTimingChange={changeCutoutTiming}
          onVideoOverlayTimingChange={changeVideoOverlayTiming}
          onTextOverlayTimingChange={changeTextOverlayTiming}
          onTextOverlayUpdate={updateTextOverlay}
          timelineWindow={project?.editorPreferences.timelineWindow || "auto"}
          onTimelineWindowChange={changeTimelineWindow}
          selectedClipId={selectedClipId}
          onSelectClip={setSelectedClipId}
          selectedDeletedClipId={selectedDeletedClipId}
          onSelectDeletedClip={(id) => { setSelectedDeletedClipId(id); setSelectedClipId(null); }}
          onRemoveClip={removeSelectedProgramClip}
          onSplitAt={splitProgramAt}
          onRestoreClip={restoreDeletedProgramClip}
          splitMode={splitMode}
          onSplitModeChange={() => setSplitMode((active) => !active)}
          viewDeleted={viewDeleted}
          onViewDeletedChange={setViewDeleted}
          />
        </div></>}
      </section>
    </main>{project && <SourceBrowser project={project} open={sourceBrowserOpen} selectedClipId={selectedClipId} cutoutStatus={cutoutStatus} onClose={() => setSourceBrowserOpen(false)} onInsert={insertSourceIntoProgram} onReplace={replaceSourceInProgram} onCreateCutout={createSubjectCutout} />}{recordingTakeMenu && recordingPreviewProject && <RecordingTakeMenu project={recordingPreviewProject} state={recordingTakeMenu} onSelect={chooseRecordingTake} onClose={() => setRecordingTakeMenu(null)} />}{pitchVisible && <PitchPopup artifact={pitchArtifact} mode={mode} ranges={ranges} duration={originalDuration} playheadRatio={displayDuration ? displayTime / displayDuration : 0} status={pitchStatus} onSeekRatio={seekFromRatio} onClose={() => setPitchVisible(false)} />}{projectRail}</>
  );
}

function RecordingSourceTimeline({ project, duration, thumbnails, waveform, currentTime, selected, onSeek, onSelect }: RecordingSourceTimelineProps) {
  const plan = recordingPlanForProject(project);
  const sourceDuration = recordingPlanDuration(plan, duration);
  function seek(event: MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    onSeek(((event.clientX - bounds.left) / bounds.width) * sourceDuration);
  }
  return <section className={`recording-source-section ${selected ? "selected" : ""}`} aria-label="Full source recording"><header><button className="recording-source-selector" aria-label={`View full source recording ${plan.sourceLabel}`} aria-pressed={selected} onClick={onSelect} onKeyDown={(event) => activateRecordingButton(event, onSelect)}><strong>{plan.sourceLabel}</strong><span>{formatTime(sourceDuration)}</span></button></header><div className="recording-source-timeline" role="slider" tabIndex={0} aria-label="Full recording timeline" onClick={seek}><ThumbnailStrip thumbnails={thumbnails} /><Waveform peaks={waveform} />{plan.outputs.flatMap((output, outputIndex) => output.sourceRanges.map((range, rangeIndex) => <span className="recording-source-range" key={`${output.id}.${rangeIndex}`} style={{ left: `${(range.start / sourceDuration) * 100}%`, width: `${((range.end - range.start) / sourceDuration) * 100}%`, "--recording-color": segmentColors[outputIndex % segmentColors.length] } as CSSProperties} />))}<TrackPlayhead playhead={`${(currentTime / sourceDuration) * 100}%`} /></div></section>;
}

function RecordingPlanPanel({ project, outputProjects, selectedOutputId, activeClipId, onPreview, onPlaySegment, onTakeMenu }: RecordingPlanPanelProps) {
  const plan = recordingPlanForProject(project);
  return <section className="recording-plan-panel" aria-label="Recording projects"><header><span>Output projects</span><strong>{plan.outputs.length}</strong></header><ol className="recording-output-list">{plan.outputs.map((output, index) => <RecordingOutputCard key={output.id} project={outputProjects[output.id]} output={output} index={index} plan={plan} selected={selectedOutputId === output.id} activeClipId={selectedOutputId === output.id ? activeClipId : null} onPreview={onPreview} onPlaySegment={onPlaySegment} onTakeMenu={onTakeMenu} />)}</ol></section>;
}

function RecordingOutputCard({ project, output, index, plan, selected, activeClipId, onPreview, onPlaySegment, onTakeMenu }: RecordingOutputCardProps) {
  const ranges = project ? recordingProgramSegments(project) : recordingFallbackSegments(plan, output);
  const count = project ? countProgramScenesAndTakes(project) : null;
  const preview = () => { void onPreview(output); };
  const summary = count ? `${count.scenes} scenes · ${count.takes} takes · ${formatTime(cutDuration(ranges))}` : output.summary || outputRangeSummary(output);
  return <li className={selected ? "selected" : ""}><button className="recording-output-select" aria-label={`View assembled project ${output.projectTitle}`} aria-pressed={selected} onClick={preview} onKeyDown={(event) => activateRecordingButton(event, preview)} /><div className="recording-output-card"><div className="recording-output-heading"><span className="recording-output-number">{index + 1}</span><div><strong className="recording-output-title">{output.projectTitle}</strong><p>{summary}</p></div></div><MiniProjectTimeline project={project} output={output} ranges={ranges} activeClipId={activeClipId} onPlaySegment={onPlaySegment} onTakeMenu={onTakeMenu} /></div></li>;
}

function recordingFallbackSegments(plan: RecordingPlan, output: RecordingPlanOutput) {
  let programStart = 0;
  return recordingOutputRanges(plan, output).map((range) => {
    const segment = { ...range, programStart, programEnd: programStart + range.end - range.start };
    programStart = segment.programEnd;
    return segment;
  });
}

function activateRecordingButton(event: ReactKeyboardEvent<HTMLElement>, activate: () => void) {
  if (event.target !== event.currentTarget) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  activate();
}

function MiniProjectTimeline({ project, output, ranges, activeClipId, onPlaySegment, onTakeMenu }: MiniProjectTimelineProps) {
  const total = cutDuration(ranges) || recordingPlanCoverage(output) || 1;
  return <div className="recording-output-preview">{ranges.map((range, index) => <RecordingOutputSegment key={`${output.id}.preview.${range.clipId || index}`} project={project} output={output} range={range} width={((range.end - range.start) / total) * 100} active={Boolean(range.clipId && range.clipId === activeClipId)} onPlaySegment={onPlaySegment} onTakeMenu={onTakeMenu} />)}</div>;
}

function RecordingOutputSegment({ project, output, range, width, active, onPlaySegment, onTakeMenu }: RecordingOutputSegmentProps) {
  const scene = project?.scenes.find((item) => item.id === range.sceneId);
  const takeCount = scene?.takes.length || 0;
  const open = (point: MenuPoint) => { if (range.clipId && takeCount) void onTakeMenu(output, range.clipId, point); };
  function contextMenu(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault(); event.stopPropagation(); open({ x: event.clientX, y: event.clientY });
  }
  function keyboardMenu(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    event.preventDefault(); event.stopPropagation(); const bounds = event.currentTarget.getBoundingClientRect(); open({ x: bounds.left, y: bounds.bottom });
  }
  function keyboard(event: ReactKeyboardEvent<HTMLButtonElement>) {
    keyboardMenu(event);
    if (!recordingSegmentActivationKey(event.key, event.repeat) || !range.clipId) return;
    event.preventDefault(); event.stopPropagation(); onPlaySegment(output, range.clipId);
  }
  const label = scene ? `${scene.label}, ${takeCount} ${takeCount === 1 ? "take" : "takes"}. Play from ${formatTime(range.programStart)}. Right-click to choose take.` : `${range.label || "Clip"}. Play from ${formatTime(range.programStart)}.`;
  return <button className={`recording-output-segment${active ? " active" : ""}`} style={{ width: `${width}%` }} aria-label={label} aria-pressed={active} aria-haspopup={takeCount ? "menu" : undefined} onClick={(event) => { event.stopPropagation(); if (range.clipId) onPlaySegment(output, range.clipId); }} onContextMenu={contextMenu} onKeyDown={keyboard}><i>{formatTime(range.end - range.start)}</i></button>;
}

function RecordingTakeMenu({ project, state, onSelect, onClose }: RecordingTakeMenuProps) {
  const clip = project.programTimeline.clips.find((item) => item.id === state.clipId);
  const scene = project.scenes.find((item) => item.id === clip?.sceneId);
  useEffect(() => {
    const dismiss = (event: PointerEvent | KeyboardEvent) => { if (event instanceof KeyboardEvent ? event.key === "Escape" : !(event.target as Element).closest(".recording-take-menu")) onClose(); };
    document.addEventListener("pointerdown", dismiss); document.addEventListener("keydown", dismiss);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", dismiss); };
  }, [onClose]);
  if (!clip || !scene) return null;
  return <div className="recording-take-menu" role="menu" aria-label={`Choose take for ${scene.label}`} style={takeMenuStyle(state, scene.takes.length)}><header><strong>{scene.label}</strong><span>{scene.takes.length} {scene.takes.length === 1 ? "take" : "takes"}</span></header>{scene.takes.map((take) => <button key={take.id} role="menuitemradio" aria-checked={take.id === clip.takeId} onClick={() => { void onSelect(take.id); }}>{take.id === clip.takeId ? <Check size={14} weight="bold" /> : <span className="take-check-space" />}<span>Take {take.order}</span><i>{formatTime(take.end - take.start)}</i></button>)}</div>;
}

function takeMenuStyle(state: RecordingTakeMenuState, takeCount: number): CSSProperties {
  const height = Math.min(340, 54 + takeCount * 35);
  return { left: Math.max(12, Math.min(state.x, window.innerWidth - 242)), top: Math.max(12, Math.min(state.y, window.innerHeight - height - 12)) };
}

function outputRangeSummary(output: RecordingPlanOutput) {
  if (!output.sourceRanges.length) return "Source sections not assigned yet";
  const label = output.sourceRanges.length === 1 ? "section" : "sections";
  return `${output.sourceRanges.length} source ${label} · ${formatTime(recordingPlanCoverage(output))}`;
}

function SaveIndicator({ status }: { status: ProjectSaveStatus }) {
  if (status.state === "saved") return null;
  const text = status.state === "saving" ? "Saving…" : "Save failed";
  return <span className={`save-indicator ${status.state}`} role={status.state === "failed" ? "alert" : "status"} title={status.error || `Saving project revision ${status.revision + 1}`}>{text}</span>;
}

function PlayFromStartIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4v16" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" /><path d="M9 5.5 19 12 9 18.5z" fill="currentColor" /></svg>;
}

function ProjectLanding({ error, onOpenProjects }: { error: string; onOpenProjects: () => void }) {
  return (
    <main className="empty-editor">
      <div className="empty-header"><span className="header-brand"><button className="projects-button" aria-label="Projects" title="Projects" onClick={onOpenProjects}><List size={22} weight="bold" /></button><span className="wordmark">Cutroom</span></span></div>
      <section className="empty-state">
        <div className="empty-frame"><FilmStrip size={34} /></div>
        <div className="empty-title"><h1>No project open</h1></div>
        <div className="empty-copy"><p>Open a Cutroom project from its Codex task.</p></div>
        {error && <p className="analysis-error">{error}</p>}
      </section>
    </main>
  );
}

function ExportNotice({ status, onCancel, onRetry }: ExportNoticeProps) {
  if (status?.state === "queued" || status?.state === "exporting") return <div className="export-notice" role="status"><span>{status.message}</span><progress max="1" value={status.progress} /><button onClick={onCancel}>Cancel</button></div>;
  if (status?.state === "failed" || status?.state === "cancelled") return <div className="export-notice failed" role="alert"><span>{status.error || status.message}</span><button onClick={onRetry}>Retry</button></div>;
  return null;
}

function Timeline({ project, mode, duration, ranges, thumbnails, waveform, playhead, onViewPitch, addMediaOpen, onAddMedia, onSeek, onTrim, selectedOverlayId, onSelectOverlay, onOverlayTimingChange, onCandidateSelect, onCutoutTimingChange, onVideoOverlayTimingChange, onTextOverlayTimingChange, onTextOverlayUpdate, timelineWindow, onTimelineWindowChange, selectedClipId, onSelectClip, selectedDeletedClipId, onSelectDeletedClip, onRemoveClip, onSplitAt, onRestoreClip, splitMode, onSplitModeChange, viewDeleted, onViewDeletedChange }: TimelineProps) {
  const timelineDuration = mode === "cut" ? cutDuration(ranges) : duration;
  const canvasWidth = `${timelineCanvasPercent(timelineDuration, timelineWindow)}%`;
  const multiSource = mode === "cut" && new Set(ranges.map((range) => range.sourceId)).size > 1;
  return (
    <section className="timeline-section">
      <div className="timeline-heading">
        <span className="timeline-tools">{mode === "cut" && <><button className="add-media-button" aria-expanded={addMediaOpen} onClick={onAddMedia}><Plus size={14} weight="bold" />Add</button><button className={`timeline-tool ${splitMode ? "active" : ""}`} aria-label="Split" title="Split" aria-pressed={splitMode} onClick={onSplitModeChange}><Scissors size={16} /></button>{selectedClipId && <button className="timeline-tool delete" aria-label="Delete segment" title="Delete segment" onClick={onRemoveClip}><Trash size={16} /></button>}{selectedDeletedClipId && <button className="timeline-tool restore" aria-label="Restore segment" title="Restore segment" onClick={onRestoreClip}><ArrowCounterClockwise size={16} /></button>}</>}</span>
        <span className="timeline-heading-actions"><TimelineSettings timelineWindow={timelineWindow} onViewPitch={onViewPitch} viewDeleted={viewDeleted} onViewDeletedChange={onViewDeletedChange} onTimelineWindowChange={onTimelineWindowChange} /></span>
      </div>
      <div className="timeline-viewport">
        <div className="timeline-canvas" style={{ width: canvasWidth }}>
          <div className="timeline-program-grid">
            <div className="timeline-track-label program-track-label">{mode === "cut" ? "Program" : "Recording"}</div>
            <div className={`timeline ${mode} timeline-track-content ${splitMode ? "split-mode" : ""}`} role="slider" tabIndex={0} aria-label="Video timeline" onClick={(event) => { if ((event.target as HTMLElement).closest("button")) return; if (splitMode && mode === "cut") { const bounds = event.currentTarget.getBoundingClientRect(); onSplitAt(((event.clientX - bounds.left) / bounds.width) * timelineDuration); } else onSeek(event); }}>
              {multiSource ? <ProgramMediaStrip ranges={ranges} /> : <><ThumbnailStrip thumbnails={thumbnails} /><Waveform peaks={waveform} /></>}
              {mode === "original" ? <SourceHighlights ranges={ranges.filter((range) => range.sourceId === project?.mediaLibrary.primarySourceId)} duration={duration} /> : <CutDividers project={project} ranges={ranges} selectedId={selectedClipId} onSelect={onSelectClip} onTrim={onTrim} />}
              <TrackPlayhead playhead={playhead} />
            </div>
          </div>
          <div className="timeline-auxiliary-scroll">
            <div className="timeline-auxiliary-grid">
              <div className="timeline-track-label timeline-scale-label" aria-hidden="true" />
              <div className="timeline-scale"><span>0:00</span><span>{formatTime(timelineDuration)}</span></div>
              {mode === "cut" && project && viewDeleted && <DeletedProgramTrack deleted={project.programTimeline.deletedClips || []} duration={timelineDuration} selectedId={selectedDeletedClipId} onSelect={onSelectDeletedClip} />}
              {mode === "cut" && project && <ImageOverlayTracks project={project} ranges={ranges} playhead={playhead} selectedId={selectedOverlayId} onSelect={onSelectOverlay} onTimingChange={onOverlayTimingChange} onCandidateSelect={onCandidateSelect} />}
              {mode === "cut" && project && <CutoutOverlayTracks project={project} ranges={ranges} playhead={playhead} selectedId={selectedOverlayId} onSelect={onSelectOverlay} onTimingChange={onCutoutTimingChange} />}
              {mode === "cut" && project && <VideoOverlayTracks project={project} ranges={ranges} playhead={playhead} selectedId={selectedOverlayId} onSelect={onSelectOverlay} onTimingChange={onVideoOverlayTimingChange} />}
              {mode === "cut" && project && <TextOverlayTracks project={project} ranges={ranges} playhead={playhead} selectedId={selectedOverlayId} onSelect={onSelectOverlay} onTimingChange={onTextOverlayTimingChange} onUpdate={onTextOverlayUpdate} />}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TimelineSettings({ timelineWindow, onViewPitch, viewDeleted, onViewDeletedChange, onTimelineWindowChange }: TimelineSettingsProps) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent | KeyboardEvent) => { if (event instanceof KeyboardEvent ? event.key === "Escape" : !container.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", dismiss); document.addEventListener("keydown", dismiss);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", dismiss); };
  }, []);
  const viewPitch = () => { setOpen(false); onViewPitch(); };
  return <div className="timeline-settings" ref={container}><button aria-label="Timeline settings" title="Timeline settings" aria-expanded={open} onClick={() => setOpen((current) => !current)}><SlidersHorizontal size={15} /></button>{open && <div className="timeline-settings-menu"><label>Width<select aria-label="Timeline width" value={timelineWindow} onChange={(event) => onTimelineWindowChange(event.target.value as TimelineWindow)}><option value="auto">Auto</option><option value="15">15s</option><option value="60">1 min</option><option value="180">3 min</option><option value="300">5 min</option></select></label><button className="view-pitch" onClick={viewPitch}>View pitch</button><label className="view-deleted"><input type="checkbox" checked={viewDeleted} onChange={(event) => onViewDeletedChange(event.target.checked)} />View deleted</label></div>}</div>;
}

function PitchPopup({ artifact, mode, ranges, duration, playheadRatio, status, onSeekRatio, onClose }: PitchPopupProps) {
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [onClose]);
  return <div className="pitch-popup"><button className="pitch-popup-scrim" aria-label="Dismiss pitch" onClick={onClose} /><section className="pitch-popup-panel" role="dialog" aria-modal="true" aria-label="Pitch"><header><strong>Pitch</strong><button aria-label="Close pitch" title="Close pitch" onClick={onClose}><X size={17} /></button></header><PitchGraph artifact={artifact} mode={mode} ranges={ranges} duration={duration} playheadRatio={playheadRatio} status={status} onSeekRatio={onSeekRatio} /></section></div>;
}

function TrackPlayhead({ playhead }: { playhead: string }) {
  return <span className="track-playhead" aria-hidden="true" style={{ left: playhead }} />;
}

function DeletedProgramTrack({ deleted, duration, selectedId, onSelect }: DeletedProgramTrackProps) {
  return <><div className="timeline-track-label deleted-track-label">Deleted</div><div className="deleted-program-track timeline-track-content">{deleted.map((item) => <button key={item.clip.id} className={`deleted-program-clip ${selectedId === item.clip.id ? "selected" : ""}`} style={{ left: `${(item.formerProgramStart / duration) * 100}%`, width: `${((item.formerProgramEnd - item.formerProgramStart) / duration) * 100}%` }} aria-label={`Select deleted ${item.clip.label}`} onClick={() => onSelect(item.clip.id)}>{item.clip.label}</button>)}</div></>;
}

function AnalysisPanel({ project, duration, previewTakeId, onSeek, onUpdate, onSelect, onPreview }: AnalysisPanelProps) {
  return (
    <details className="analysis-panel" open>
      <summary>Scenes and takes <span>{project.scenes.length} scenes · {project.scenes.reduce((count, scene) => count + scene.takes.length, 0)} takes</span></summary>
      <p className="request-summary"><strong>Current interpretation:</strong> {project.requestSummary}</p>
      <div className="pipeline-map"><span>Video task</span><i>→</i><span>Parakeet words</span><i>→</i><span>Scenes</span><i>→</i><span>Takes</span><i>→</i><span>Selected cut</span></div>
      <div className="scene-list">{project.scenes.map((scene) => (
        <SceneRows key={scene.id} scene={scene} duration={duration} previewTakeId={previewTakeId} onSeek={onSeek} onUpdate={onUpdate} onSelect={onSelect} onPreview={onPreview} />
      ))}</div>
      <details className="transcript-details">
        <summary>Timestamped transcript</summary>
        <div className="transcript-words">{project.words.map((word, index) => (
          <button key={`${word.startTime}-${index}`} title={`${word.startTime.toFixed(2)}–${word.endTime.toFixed(2)}s · ${Math.round(word.confidence * 100)}%`} onClick={() => onSeek(word.startTime)}>{word.word}</button>
        ))}</div>
      </details>
    </details>
  );
}

function SceneRows({ scene, duration, previewTakeId, onUpdate, onSelect, onPreview }: SceneRowsProps) {
  return (
    <section className="scene-group">
      <div className="scene-row"><b>{scene.order}</b><span><strong>{scene.label}</strong><small>{scene.reason}</small></span><em>{scene.takes.length} {scene.takes.length === 1 ? "take" : "takes"}</em></div>
      {scene.takes.map((take) => <TakeRow key={take.id} scene={scene} take={take} duration={duration} previewing={previewTakeId === take.id} onUpdate={onUpdate} onSelect={onSelect} onPreview={onPreview} />)}
    </section>
  );
}

function TakeRow({ scene, take, duration, previewing, onUpdate, onSelect, onPreview }: TakeRowProps) {
  return (
    <div className={`take-row ${take.selected ? "selected" : ""} ${previewing ? "previewing" : ""}`}>
      <input type="radio" name={`scene-${scene.id}`} checked={take.selected} aria-label={`Select ${scene.label} ${take.label}`} onChange={() => onSelect(scene.id, take.id)} />
      <button className="take-name" aria-pressed={previewing} title={`Loop ${scene.label} ${take.label}`} onClick={() => onPreview(scene.id, take.id)}>{take.label}{previewing && <small>Looping</small>}</button>
      <span className="take-words">“{take.transcript}”<small>{take.reason}</small></span>
      <time>{take.start.toFixed(2)}–{take.end.toFixed(2)}s</time>
      <details className="trim-details"><summary>Trim</summary><label>Start<input type="range" min="0" max={duration} step="0.04" value={take.start} onChange={(event) => onUpdate(scene.id, take.id, "start", Number(event.target.value))} /></label><label>End<input type="range" min="0" max={duration} step="0.04" value={take.end} onChange={(event) => onUpdate(scene.id, take.id, "end", Number(event.target.value))} /></label></details>
    </div>
  );
}

function ThumbnailStrip({ thumbnails }: { thumbnails: string[] }) {
  if (!thumbnails.length) return <div className="thumbnail-loading">Building timeline…</div>;
  return <div className="thumbnail-strip">{thumbnails.map((thumbnail, index) => <img key={`${index}-${thumbnail.slice(-12)}`} src={thumbnail} alt="" />)}</div>;
}

function ProgramMediaStrip({ ranges }: { ranges: SourceRange[] }) {
  const total = cutDuration(ranges);
  return <div className="program-media-strip" aria-hidden="true">{ranges.map((range, index) => <span key={range.id} className={range.kind === "source" ? "reference" : "recording"} style={{ width: `${((range.end - range.start) / total) * 100}%` }}><i>{range.kind === "source" ? "REF" : `S${range.sceneOrder || index + 1}`}</i></span>)}</div>;
}

function Waveform({ peaks }: { peaks: number[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => drawWaveform(canvasRef.current, peaks), [peaks]);
  return <canvas className="waveform" ref={canvasRef} aria-hidden="true" />;
}

function drawWaveform(canvas: HTMLCanvasElement | null, peaks: number[]) {
  if (!canvas || !peaks.length) return;
  const bounds = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(bounds.width * devicePixelRatio));
  canvas.height = Math.max(1, Math.floor(bounds.height * devicePixelRatio));
  paintPeaks(canvas.getContext("2d"), canvas.width, canvas.height, peaks);
}

function paintPeaks(context: CanvasRenderingContext2D | null, width: number, height: number, peaks: number[]) {
  if (!context) return;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#b5b8b1";
  const barWidth = width / peaks.length;
  peaks.forEach((peak, index) => context.fillRect(index * barWidth, (height - peak * height) / 2, Math.max(1, barWidth * 0.58), Math.max(1, peak * height)));
}

function SourceHighlights({ ranges, duration }: { ranges: SourceRange[]; duration: number }) {
  return <>{ranges.map((range) => <span className="source-highlight" key={range.id} style={segmentStyle(range, rangeStyle(range, duration))}><b>{timelineLabel(range)}</b></span>)}</>;
}

function CutDividers({ project, ranges, selectedId, onSelect, onTrim }: { project: VideoProject | null; ranges: SourceRange[]; selectedId: string | null; onSelect: (id: string) => void; onTrim: TimelineTrimHandler }) {
  const [preview, setPreview] = useState<TimelineTrimPreview | null>(null);
  const total = cutDuration(ranges);
  return <>{timelineTrimPositions(ranges, preview).map(({ range, left, width, shortened, edge }, index) => {
    const minimum = minimumTakeEnd(project, range);
    return <span className={`cut-divider ${range.kind === "source" ? "reference" : ""} ${selectedId === range.id ? "selected" : ""} ${shortened > 0 ? "trimming" : ""}`} key={range.id} style={segmentStyle(range, { left: `${left}%`, width: `${width}%` })}><button className="program-clip-label" aria-label={`Select ${timelineLabel(range)}`} onClick={() => onSelect(range.id)}>{timelineLabel(range)}</button>{shortened > 0 && <output className={`trim-preview ${edge}`}>−{shortened.toFixed(2)}s</output>}<TimelineTrimHandle edge="start" range={range} before={cutDuration(ranges.slice(0, index))} minimum={range.start} maximum={range.end - 0.08} total={total} onPreview={setPreview} onTrim={onTrim} /><TimelineTrimHandle edge="end" range={range} before={cutDuration(ranges.slice(0, index))} minimum={minimum} maximum={range.end} total={total} onPreview={setPreview} onTrim={onTrim} /></span>;
  })}</>;
}

function TimelineTrimHandle({ edge, range, before, minimum, maximum, total, onPreview, onTrim }: TimelineTrimHandleProps) {
  const drag = useRef<TimelineTrimDrag | null>(null);
  function begin(event: ReactPointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const bounds = event.currentTarget.closest(".timeline")?.getBoundingClientRect();
    if (!bounds) return;
    drag.current = { left: bounds.left, width: bounds.width, before, minimum, total, maximum, next: edge === "start" ? range.start : range.end };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    event.stopPropagation();
    const cutTime = Math.min(drag.current.total, Math.max(0, ((event.clientX - drag.current.left) / drag.current.width) * drag.current.total));
    drag.current.next = Math.min(drag.current.maximum, Math.max(drag.current.minimum, range.start + cutTime - drag.current.before));
    onPreview({ rangeId: range.id, edge, value: drag.current.next });
  }
  function finish(event: ReactPointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const next = drag.current?.next;
    drag.current = null;
    onPreview(null);
    if (next !== undefined) onTrim(range.id, edge, next, true);
  }
  function nudge(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const shorteningKey = edge === "start" ? "ArrowRight" : "ArrowLeft";
    if (event.key !== shorteningKey) return;
    event.preventDefault();
    event.stopPropagation();
    const amount = event.shiftKey ? 0.4 : 0.04;
    const value = edge === "start" ? Math.min(maximum, range.start + amount) : Math.max(minimum, range.end - amount);
    onTrim(range.id, edge, value, true);
  }
  return <button className={`trim-edge-handle ${edge}`} aria-label={`Trim ${edge} of ${timelineLabel(range)}`} title={`Drag ${edge === "start" ? "right" : "left"} to shorten ${timelineLabel(range)}`} onClick={(event) => event.stopPropagation()} onKeyDown={nudge} onPointerCancel={finish} onPointerDown={begin} onPointerMove={move} onPointerUp={finish} />;
}

function minimumTakeEnd(project: VideoProject | null, range: SourceRange): number {
  const overlayEnd = project?.overlays.filter((overlay) => overlay.target.type === "take" && overlay.target.sceneId === range.sceneId && overlay.target.takeId === range.takeId).reduce((latest, overlay) => Math.max(latest, overlay.target.end), 0) || 0;
  return range.start + Math.max(0.08, overlayEnd);
}

function timelineLabel(range: SourceRange): string {
  if (range.kind === "source") return `REF · ${range.label || range.order}`;
  return `S${range.sceneOrder || range.order} · T${range.takeOrder || 1}`;
}

function segmentStyle(range: SourceRange, position: CSSProperties): CSSProperties {
  return { ...position, "--segment-color": segmentColors[((range.sceneOrder || range.order) - 1) % segmentColors.length] } as CSSProperties;
}

function rangeStyle(range: SourceRange, duration: number) {
  return { left: `${(range.start / duration) * 100}%`, width: `${((range.end - range.start) / duration) * 100}%` };
}

async function loadRequestedProject(): Promise<VideoProject | null> {
  const id = projectIdFromLocation(location.pathname, location.search);
  if (!id) return null;
  const redirect = legacyProjectRedirect(location.pathname, location.search);
  if (redirect) history.replaceState(history.state, "", redirect);
  return loadVideoProject(id);
}

async function loadVideoProject(id: string): Promise<VideoProject> {
  const response = await fetch(`/api/projects/${encodeURIComponent(id)}`);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not load video project.");
  return result as VideoProject;
}

async function saveProject(project: VideoProject): Promise<VideoProject> {
  const response = await fetch(`/api/projects/${project.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(project) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not save video project.");
  return result as VideoProject;
}

async function requestPitch(projectId: string, available: boolean): Promise<PitchArtifact> {
  const response = await fetch(`/api/projects/${projectId}/pitch`, { method: available ? "GET" : "POST" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not analyze pitch.");
  return result as PitchArtifact;
}

async function requestExport(projectId: string, preset: ExportPreset): Promise<ExportJobStatus> {
  const response = await fetch(`/api/projects/${projectId}/exports`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ preset }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not start export.");
  return result as ExportJobStatus;
}

async function requestCutout(projectId: string, input: CreateCutoutInput): Promise<CutoutJobStatus> {
  const response = await fetch(`/api/projects/${projectId}/cutouts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not create subject cutout.");
  return result as CutoutJobStatus;
}

function monitorCutout(projectId: string | null, status: CutoutJobStatus | null, apply: (status: CutoutJobStatus) => void) {
  if (!projectId || !status || (status.state !== "queued" && status.state !== "processing")) return;
  const timer = window.setInterval(() => { void pollCutout(projectId, status.jobId, apply); }, 700);
  return () => window.clearInterval(timer);
}

async function pollCutout(projectId: string, jobId: string, apply: (status: CutoutJobStatus) => void) {
  const response = await fetch(`/api/projects/${projectId}/cutouts/${jobId}`);
  if (response.ok) apply(await response.json() as CutoutJobStatus);
}

function failedCutoutStatus(projectId: string, error: unknown): CutoutJobStatus {
  return { jobId: "cutout-ui-error", projectId, overlayId: "", state: "failed", progress: 0, message: "Cutout failed", error: error instanceof Error ? error.message : String(error), project: null };
}

function recoverableCutoutStatus(project: VideoProject): CutoutJobStatus | null {
  const overlay = project.cutoutOverlays.find((candidate) => candidate.processing.jobId && ["queued", "processing"].includes(candidate.processing.status));
  if (!overlay?.processing.jobId) return null;
  const state = overlay.processing.status === "processing" ? "processing" : "queued";
  return { jobId: overlay.processing.jobId, projectId: project.id, overlayId: overlay.id, state, progress: overlay.processing.progress || 0, message: overlay.processing.phase ? overlay.processing.phase.replaceAll("-", " ") : "Cutout queued", error: overlay.processing.error, project };
}

async function cancelExportRequest(projectId: string, jobId: string): Promise<ExportJobStatus> {
  const response = await fetch(`/api/projects/${projectId}/exports/${jobId}`, { method: "DELETE" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not cancel export.");
  return result as ExportJobStatus;
}

function monitorExport(projectId: string | null, status: ExportJobStatus | null, setStatus: Dispatch<SetStateAction<ExportJobStatus | null>>) {
  if (!projectId || !status || (status.state !== "queued" && status.state !== "exporting")) return;
  const timer = window.setInterval(() => { void pollExport(projectId, status.jobId, setStatus); }, 500);
  return () => window.clearInterval(timer);
}

async function pollExport(projectId: string, jobId: string, setStatus: Dispatch<SetStateAction<ExportJobStatus | null>>) {
  const response = await fetch(`/api/projects/${projectId}/exports/${jobId}`);
  if (!response.ok) return;
  const next = await response.json() as ExportJobStatus;
  setStatus(next);
}

function downloadCompletedExport(projectId: string | null, status: ExportJobStatus | null, downloaded: Set<string>) {
  if (!projectId || status?.state !== "completed" || !status.receipt || downloaded.has(status.jobId)) return;
  downloaded.add(status.jobId);
  const link = document.createElement("a");
  link.href = `/api/projects/${projectId}/exports/${status.jobId}/file`;
  link.download = "";
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  logEvent("export_download_started", { projectId, jobId: status.jobId, outputPath: status.receipt.outputPath });
}

function failedExportStatus(projectId: string, preset: ExportPreset, error: unknown): ExportJobStatus {
  return { jobId: "export-ui-error", projectId, preset, state: "failed", progress: 0, processedSeconds: 0, totalSeconds: 0, etaSeconds: null, message: "Export failed.", receipt: null, error: error instanceof Error ? error.message : String(error), startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() };
}

async function waitForSeek(video: HTMLVideoElement) {
  if (!video.seeking) return;
  await new Promise<void>((resolve) => video.addEventListener("seeked", () => resolve(), { once: true }));
}

function trimTake(take: TakeProposal, edge: "start" | "end", value: number, duration: number): TakeProposal {
  if (edge === "start") return { ...take, start: Math.max(0, Math.min(value, take.end - 0.08)) };
  return { ...take, end: Math.min(duration, Math.max(value, take.start + 0.08)) };
}

function updateSceneTakeInterval(scenes: SceneProposal[], before: ProgramClip, after: ProgramClip): SceneProposal[] {
  return scenes.map((scene) => scene.id !== before.sceneId ? scene : { ...scene, takes: scene.takes.map((take) => take.id !== before.takeId ? take : { ...take, start: after.sourceStart, end: after.sourceEnd }) });
}

function sourceState(project: VideoProject, sourceId: string): SourceState {
  const media = project.mediaLibrary.sources.find((candidate) => candidate.id === sourceId);
  if (!media) throw new Error(`Unknown media source: ${sourceId}`);
  return { name: media.label, url: `/api/projects/${project.id}/media/${sourceId}`, objectUrl: false };
}

function useObjectUrlCleanup(source: SourceState) {
  useEffect(() => () => {
    if (source.objectUrl) URL.revokeObjectURL(source.url);
  }, [source]);
}

function useVideoPaintSurface(videoRef: RefObject<HTMLVideoElement | null>, canvasRef: RefObject<HTMLCanvasElement | null>, source: string) {
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !source) return;
    return superviseVideoPainting(video, canvas);
  }, [canvasRef, source, videoRef]);
}

function useThumbnailExtraction(source: string, duration: number, setThumbnails: Dispatch<SetStateAction<string[]>>) {
  useEffect(() => {
    if (!source || !duration) return;
    let cancelled = false;
    createVideoThumbnails(source, duration).then((frames) => {
      if (!cancelled) setThumbnails(frames);
    }).catch((error) => logError("thumbnail_extraction_failed", error));
    return () => { cancelled = true; };
  }, [source, duration, setThumbnails]);
}

function useWaveformExtraction(source: string, setWaveform: Dispatch<SetStateAction<number[]>>) {
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    createAudioPeaks(source).then((peaks) => {
      if (!cancelled) setWaveform(peaks);
    }).catch((error) => logError("waveform_extraction_failed", error));
    return () => { cancelled = true; };
  }, [source, setWaveform]);
}

type SourceState = { name: string; url: string; objectUrl: boolean };
type TimelineProps = { project: VideoProject | null; mode: ViewMode; duration: number; ranges: SourceRange[]; thumbnails: string[]; waveform: number[]; playhead: string; onViewPitch: () => void; addMediaOpen: boolean; onAddMedia: () => void; onSeek: (event: MouseEvent<HTMLDivElement>) => void; onTrim: TimelineTrimHandler; selectedOverlayId: string | null; onSelectOverlay: (id: string, start: number) => void; onOverlayTimingChange: (id: string, start: number, end: number, commit: boolean) => void; onCandidateSelect: (bundleId: string, assetId: string) => void; onCutoutTimingChange: (id: string, start: number, end: number, commit: boolean) => void; onVideoOverlayTimingChange: (id: string, start: number, end: number, commit: boolean) => void; onTextOverlayTimingChange: (id: string, start: number, end: number, commit: boolean) => void; onTextOverlayUpdate: (overlay: TextOverlay) => void; timelineWindow: TimelineWindow; onTimelineWindowChange: (window: TimelineWindow) => void; selectedClipId: string | null; onSelectClip: (id: string) => void; selectedDeletedClipId: string | null; onSelectDeletedClip: (id: string) => void; onRemoveClip: () => void; onSplitAt: (cutTime: number) => void; onRestoreClip: () => void; splitMode: boolean; onSplitModeChange: () => void; viewDeleted: boolean; onViewDeletedChange: (visible: boolean) => void };
type ExportNoticeProps = { status: ExportJobStatus | null; onCancel: () => void; onRetry: () => void };
type AnalysisPanelProps = { project: VideoProject; duration: number; previewTakeId: string | null; onSeek: (time: number, index?: number) => void; onUpdate: (sceneId: string, takeId: string, edge: "start" | "end", value: number) => void; onSelect: (sceneId: string, takeId: string) => void; onPreview: (sceneId: string, takeId: string) => void };
type SceneRowsProps = Omit<AnalysisPanelProps, "project"> & { scene: SceneProposal };
type TakeRowProps = Pick<AnalysisPanelProps, "duration" | "onUpdate" | "onSelect" | "onPreview"> & { scene: SceneProposal; take: TakeProposal; previewing: boolean };
type TimelineTrimHandler = (clipId: string, edge: "start" | "end", value: number, commit: boolean) => void;
type TimelineTrimHandleProps = { edge: "start" | "end"; range: SourceRange; before: number; minimum: number; maximum: number; total: number; onPreview: (preview: TimelineTrimPreview | null) => void; onTrim: TimelineTrimHandler };
type TimelineTrimDrag = { left: number; width: number; before: number; minimum: number; total: number; maximum: number; next: number };
type TimelineSettingsProps = { timelineWindow: TimelineWindow; onViewPitch: () => void; viewDeleted: boolean; onViewDeletedChange: (visible: boolean) => void; onTimelineWindowChange: (window: TimelineWindow) => void };
type PitchPopupProps = { artifact: PitchArtifact | null; mode: ViewMode; ranges: SourceRange[]; duration: number; playheadRatio: number; status: PitchStatus; onSeekRatio: (ratio: number) => void; onClose: () => void };
type DeletedProgramTrackProps = { deleted: DeletedProgramClip[]; duration: number; selectedId: string | null; onSelect: (id: string) => void };
type PendingMediaLoad = { time: number; rangeIndex: number; play: boolean };
type TakePreview = { sceneId: string; takeId: string; start: number; end: number };
type WorkflowStep = "projects" | ViewMode;
type RecordingSourceTimelineProps = { project: VideoProject; duration: number; thumbnails: string[]; waveform: number[]; currentTime: number; selected: boolean; onSeek: (time: number) => void; onSelect: () => void };
type RecordingPlanPanelProps = { project: VideoProject; outputProjects: Record<string, VideoProject>; selectedOutputId: string | null; activeClipId: string | null; onPreview: (output: RecordingPlanOutput) => Promise<VideoProject | null | undefined>; onPlaySegment: RecordingSegmentPlayHandler; onTakeMenu: RecordingTakeMenuHandler };
type RecordingOutputCardProps = { project: VideoProject | undefined; output: RecordingPlanOutput; index: number; plan: RecordingPlan; selected: boolean; activeClipId: string | null; onPreview: RecordingPlanPanelProps["onPreview"]; onPlaySegment: RecordingSegmentPlayHandler; onTakeMenu: RecordingTakeMenuHandler };
type MiniProjectTimelineProps = { project: VideoProject | undefined; output: RecordingPlanOutput; ranges: RecordingProgramSegment[]; activeClipId: string | null; onPlaySegment: RecordingSegmentPlayHandler; onTakeMenu: RecordingTakeMenuHandler };
type RecordingOutputSegmentProps = { project: VideoProject | undefined; output: RecordingPlanOutput; range: RecordingProgramSegment; width: number; active: boolean; onPlaySegment: RecordingSegmentPlayHandler; onTakeMenu: RecordingTakeMenuHandler };
type RecordingTakeMenuProps = { project: VideoProject; state: RecordingTakeMenuState; onSelect: (takeId: string) => Promise<void>; onClose: () => void };
type RecordingTakeMenuState = MenuPoint & { outputId: string; clipId: string };
type RecordingTakeMenuHandler = (output: RecordingPlanOutput, clipId: string, point: MenuPoint) => Promise<void>;
type RecordingSegmentPlayHandler = (output: RecordingPlanOutput, clipId: string) => void;
type MenuPoint = { x: number; y: number };
const segmentColors = ["#61d6b3", "#8ea7ff", "#f0a45d", "#d98cff", "#f06f8d"];

function ignoreOverlaySelection(_id: string) {}
function ignoreOverlayLayout(_id: string, _layout: OverlayLayout, _commit: boolean) {}
function ignoreTextPosition(_id: string, _x: number, _y: number, _persist: boolean) {}

import { ArrowCounterClockwise, ArrowRight, ArrowsOut, Check, Export as ExportIcon, FilmStrip, GitBranch, List, ListChecks, Pause, Play, Plus, Scissors, SlidersHorizontal, SpeakerHigh, SpeakerSlash, Trash, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type CSSProperties, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type RefObject, type SetStateAction } from "react";
import type { CutProposal, DeletedProgramClip, ExportPreset, OverlayLayout, ProgramClip, ProjectTrashReceipt, RecordingPlan, RecordingPlanOutput, SceneProposal, TakeProposal, TextOverlay, TimelineWindow, VideoMediaSource, VideoProject } from "./analysis-model";
import { createAudioPeaks } from "./audio-waveform";
import { cutDuration, cutTimeFromSource, formatTime, sourceLocationFromCutTime, type SourceRange, type ViewMode } from "./editor-model";
import { EditableOverlayStage, ImageOverlayTracks } from "./ImageOverlayEditors";
import { normalizeImageOverlayHeights, selectImageBundleCandidate } from "./ImageBundleModel";
import { createVideoThumbnails } from "./media-thumbnails";
import type { ExportJobStatus } from "./ExportModel";
import { PitchGraph, type PitchStatus } from "./PitchGraph";
import type { PitchArtifact } from "./PitchModel";
import { handlePageSpace, playbackDecision } from "./PlaybackShortcut";
import { selectedCutsFromScenes } from "./ProjectCutModel";
import { timelineTrimPositions, type TimelineTrimPreview } from "./TimelineTrimPreviewModel";
import { takePreviewRestart } from "./TakePreviewModel";
import { imageOverlayWithCutInterval } from "./overlay-model";
import { logError, logEvent } from "./structured-log";
import { ProjectSaveQueue, type ProjectSaveStatus } from "./ProjectSaveQueue";
import { timelineCanvasPercent } from "./TimelineWindowModel";
import { ProjectRail } from "./ProjectRail";
import { displayProjectTitle } from "./ProjectTitle";
import { deleteProgramClip, insertProgramClip, programRanges, replaceProgramClip, restoreProgramClip, sourceProgramClip, splitProgramClip, syncSceneClip, trimProgramClip } from "./ProgramTimelineModel";
import { shiftSelectedCutOverlays } from "./ProgramDeleteModel";
import { SourceBrowser } from "./SourceBrowser";
import { CutoutOverlayStage, CutoutOverlayTracks } from "./CutoutOverlayEditors";
import { cutoutWithProgramInterval } from "./CutoutOverlayModel";
import { VideoOverlayStage, VideoOverlayTracks } from "./VideoOverlayEditors";
import { videoOverlayWithProgramInterval } from "./VideoOverlayModel";
import { TextOverlayStage, TextOverlayTracks } from "./TextOverlayEditors";
import { textOverlayWithProgramInterval } from "./TextOverlayModel";
import type { CreateCutoutInput, CutoutJobStatus } from "./CutoutModel";
import { legacyProjectRedirect, projectIdFromLocation } from "./ProjectRoute";
import { paintVideoFrame, superviseVideoPainting } from "./VideoPaintSurface";
import { recordingOutputRanges, recordingPlanCoverage, recordingPlanDuration, recordingPlanForProject } from "./RecordingPlanModel";
import { projectRecordingViewer, rawRecordingViewer } from "./RecordingViewerModel";
import { countProgramScenesAndTakes, recordingProgramSegments, recordingSegmentActivationKey, selectProgramTake, type RecordingProgramSegment } from "./RecordingTakeSelectionModel";
