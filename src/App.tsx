const emptySource: SourceState = { name: "", url: "", objectUrl: false };

export function App() {
  const [source, setSource] = useState<SourceState>(emptySource);
  const [project, setProject] = useState<VideoProject | null>(null);
  const [projectError, setProjectError] = useState("");
  const [duration, setDuration] = useState(0);
  const [originalDuration, setOriginalDuration] = useState(0);
  const [ranges, setRanges] = useState<SourceRange[]>([]);
  const [mode, setMode] = useState<ViewMode>("cut");
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
  const [cutoutStatus, setCutoutStatus] = useState<CutoutJobStatus | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const activeRangeRef = useRef(0);
  const seekingRef = useRef(false);
  const saveQueueRef = useRef<ProjectSaveQueue | null>(null);
  const downloadedExportsRef = useRef(new Set<string>());
  const syncedExportsRef = useRef(new Set<string>());
  const pendingMediaRef = useRef<PendingMediaLoad | null>(null);
  if (!saveQueueRef.current) saveQueueRef.current = new ProjectSaveQueue(saveProject, setSaveStatus);

  useObjectUrlCleanup(source);
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

  const assembledDuration = cutDuration(ranges);
  const displayRange = Math.min(activeRange, Math.max(0, ranges.length - 1));
  const displayTime = mode === "cut" && ranges.length
    ? cutTimeFromSource(ranges, displayRange, currentTime)
    : currentTime;
  const displayDuration = mode === "cut" ? assembledDuration : originalDuration;

  function handleMetadata() {
    const nextDuration = videoRef.current?.duration || 0;
    setDuration(nextDuration);
    if (project && activeSourceId(source.url) === project.mediaLibrary.primarySourceId) setOriginalDuration(nextDuration);
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
    setCurrentTime(video.currentTime);
    if (!seekingRef.current && mode === "cut" && ranges.length) advanceCutIfNeeded(video);
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
    const sourceId = ranges[rangeIndex]?.sourceId || project?.mediaLibrary.primarySourceId;
    if (!project || !sourceId || activeSourceId(source.url) === sourceId) return false;
    switchToSource(sourceId, time, rangeIndex, play);
    return true;
  }

  function switchToSource(sourceId: string, time: number, rangeIndex: number, play: boolean) {
    if (!project) return;
    pendingMediaRef.current = { time, rangeIndex, play };
    setCurrentTime(time);
    activeRangeRef.current = rangeIndex;
    setActiveRange(rangeIndex);
    setSource(sourceState(project, sourceId));
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
    const decision = playbackDecision({ paused: video.paused, mode, currentTime: video.currentTime, duration: originalDuration, activeRange: activeRangeRef.current, ranges });
    if (decision.type === "pause") return video.pause();
    if (decision.type === "replay") return playAt(decision.time, decision.rangeIndex);
    await video.play();
  }

  async function playFromStart() {
    const video = videoRef.current;
    if (!video) return;
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
    setMode(nextMode);
    if (nextMode === "cut" && ranges.length) switchOrSeek(ranges[0].start, 0);
    if (nextMode === "original" && project) switchToSource(project.mediaLibrary.primarySourceId, 0, 0, false);
    logEvent("timeline_mode_changed", { mode: nextMode });
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
    const normalized = { ...next, cuts: selectedCutsFromScenes(next.scenes) };
    const nextRanges = programRanges(normalized);
    setProject(normalized);
    saveQueueRef.current?.reset(normalized);
    setRanges(nextRanges);
    setSelectedClipId(nextRanges[0]?.id || null);
    setMode(nextRanges.length ? "cut" : "original");
    const first = nextRanges[0];
    pendingMediaRef.current = first ? { time: first.start, rangeIndex: 0, play: false } : null;
    setSource(sourceState(normalized, first?.sourceId || normalized.mediaLibrary.primarySourceId));
    setSelectedOverlayId(null);
  }

  async function togglePitch() {
    const visible = !pitchVisible;
    setPitchVisible(visible);
    if (!visible || pitchArtifact || !project) return;
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

  function trimTimelineEnd(clipId: string, value: number, commit: boolean) {
    updateProgramClipTrim(clipId, "end", value, commit);
    seekTo(value);
    if (commit) logEvent("timeline_trim_committed", { clipId, end: value });
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

  function moveSelectedProgramClip(direction: -1 | 1) {
    if (!project || !selectedClipId) return;
    commitProject({ ...project, programTimeline: moveProgramClip(project.programTimeline, selectedClipId, direction) });
    logEvent("program_clip_moved", { clipId: selectedClipId, direction });
  }

  function removeSelectedProgramClip() {
    if (!project || !selectedClipId) return;
    const clip = project.programTimeline.clips.find((candidate) => candidate.id === selectedClipId);
    if (!clip || clip.kind === "scene") return;
    const programTimeline = removeProgramClip(project.programTimeline, clip.id);
    commitProject({ ...project, programTimeline });
    setSelectedClipId(programTimeline.clips[0]?.id || null);
    logEvent("program_clip_removed", { clipId: clip.id });
  }

  function nudgeSelectedProgramClip(edge: "start" | "end", delta: number) {
    if (!project || !selectedClipId) return;
    const clip = project.programTimeline.clips.find((candidate) => candidate.id === selectedClipId);
    if (!clip) return;
    updateProgramClipTrim(clip.id, edge, (edge === "start" ? clip.sourceStart : clip.sourceEnd) + delta, true);
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
    if (selected) previewSelectedTake(sceneId, selected.start);
  }

  function previewSelectedTake(sceneId: string, start: number) {
    videoRef.current?.pause();
    setMode("cut");
    const rangeIndex = Math.max(0, ranges.findIndex((range) => range.sceneId === sceneId));
    seekTo(start, rangeIndex);
    logEvent("take_selected", { sceneId, sourceTime: start });
  }

  function moveScene(id: string, direction: -1 | 1) {
    if (!project) return;
    const index = project.scenes.findIndex((scene) => scene.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= project.scenes.length) return;
    const next = [...project.scenes];
    [next[index], next[target]] = [next[target], next[index]];
    const clip = project.programTimeline.clips.find((candidate) => candidate.sceneId === id);
    const programTimeline = clip ? moveProgramClip(project.programTimeline, clip.id, direction) : project.programTimeline;
    commitScenes(next, true, programTimeline);
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
    <button aria-label={muted ? "Unmute" : "Mute"} onClick={() => setMuted((value) => !value)}>{muted ? <SpeakerSlash size={22} /> : <SpeakerHigh size={22} />}</button>
    <button className="restart-button" aria-label="Play from start" title="Play from start" onClick={playFromStart}><PlayFromStartIcon /></button>
    <button className="play-button" aria-label={playing ? "Pause" : "Play"} onClick={togglePlayback}>{playing ? <Pause size={28} weight="fill" /> : <Play size={28} weight="fill" />}</button>
    <span className="time-readout">{formatTime(displayTime)} / {formatTime(displayDuration)}</span>
    <button aria-label="Fullscreen" onClick={() => viewerRef.current?.requestFullscreen()}><ArrowsOut size={22} /></button>
  </div>;
  const videoPreview = <aside className="viewer-column" aria-label="Video preview"><div className="viewer" ref={viewerRef}>
    <video ref={videoRef} src={source.url} muted={muted} playsInline onLoadedMetadata={handleMetadata} onTimeUpdate={handleTimeUpdate} onSeeked={handleSeeked} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
    {project && <EditableOverlayStage project={project} mode={mode} sourceTime={currentTime} cutTime={displayTime} selectedId={selectedOverlayId} onSelect={setSelectedOverlayId} onLayoutChange={changeOverlayLayout} />}
    {project && <CutoutOverlayStage project={project} mode={mode} cutTime={displayTime} playing={playing} selectedId={selectedOverlayId} onSelect={setSelectedOverlayId} onLayoutChange={changeCutoutLayout} />}
  </div></aside>;

  const projectRail = <ProjectRail open={projectRailOpen} currentProjectId={project?.id || null} onClose={() => setProjectRailOpen(false)} onProjectRenamed={applyRenamedProject} onProjectTrashed={applyTrashedProject} />;
  if (!source.url) return <>{projectRail}<ProjectLanding error={projectError} onOpenProjects={() => setProjectRailOpen(true)} /></>;

  return (
    <><main className="editor-shell" onPointerDown={dismissOverlayFromBackground}>
      <header className="editor-header">
        <div>
          <button className="projects-button" aria-label="Projects" title="Projects" aria-expanded={projectRailOpen} onClick={() => setProjectRailOpen((current) => !current)}><List size={22} weight="bold" /></button>
          <span className="wordmark">Cutroom</span>
          <span className="file-name">{displayProjectTitle(project?.title || source.name)}</span>
        </div>
        <div className="header-actions"><SaveIndicator status={saveStatus} /><div className="export-control"><button className="export-button" aria-label="Export video" title="Export video" aria-expanded={exportMenuOpen} disabled={exportStatus?.state === "queued" || exportStatus?.state === "exporting"} onClick={() => setExportMenuOpen((open) => !open)}><ExportIcon size={18} weight="bold" /></button>{exportMenuOpen && <div className="export-menu" role="menu" aria-label="Export options"><button role="menuitem" onClick={() => startExport("original-format")}><strong>Export original format</strong><span>HEVC · MOV · preserve source / smart render</span></button><button role="menuitem" onClick={() => startExport("tiktok-60")}><strong>Export for TikTok</strong><span>1080×1920 · 60 fps · MP4 · transcodes</span></button></div>}<ExportNotice status={exportStatus} onCancel={cancelExport} onRetry={() => startExport(exportStatus?.preset || "original-format")} /></div></div>
      </header>

      <section className="workspace" aria-label="Video editor">
        <nav className="workflow-steps" aria-label="Editing workflow">
          <button className={mode === "original" ? "active" : ""} onClick={() => changeMode("original")}><b>1</b><span>Select scenes &amp; takes</span></button>
          <button disabled={!ranges.length} title={ranges.length ? "Edit the assembled cut" : "No cut has been made yet"} className={mode === "cut" ? "active" : ""} onClick={() => changeMode("cut")}><b>2</b><span>Edit timeline</span></button>
        </nav>
        {!ranges.length && <p className="no-cut-note">No take selected. Ask the video task to revise this project.</p>}
        {projectError && <p className="analysis-error">{projectError}</p>}

        {mode === "original" && <div className="phase-preview original"><div className="selection-phase">{playerControls}{project && <AnalysisPanel project={project} duration={originalDuration} onSeek={seekTo} onUpdate={updateTake} onSelect={selectTake} onMove={moveScene} />}</div>{videoPreview}</div>}
        {mode === "cut" && <><div className="phase-preview cut">{videoPreview}</div><div className="edit-phase">{playerControls}
          {project && <SourceBrowser project={project} open={sourceBrowserOpen} selectedClipId={selectedClipId} cutoutStatus={cutoutStatus} onClose={() => setSourceBrowserOpen(false)} onInsert={insertSourceIntoProgram} onCreateCutout={createSubjectCutout} />}
          <Timeline
          project={project}
          mode={mode}
          duration={originalDuration}
          ranges={ranges}
          thumbnails={thumbnails}
          waveform={waveform}
          playhead={playhead}
          pitchVisible={pitchVisible}
          pitchArtifact={pitchArtifact}
          pitchStatus={pitchStatus}
          onTogglePitch={togglePitch}
          onSeekRatio={seekFromRatio}
          onSeek={seekFromTimeline}
          onTrimEnd={trimTimelineEnd}
          selectedOverlayId={selectedOverlayId}
          onSelectOverlay={showOverlay}
          onOverlayTimingChange={changeOverlayTiming}
          onCandidateSelect={selectBundleCandidate}
          onCutoutTimingChange={changeCutoutTiming}
          timelineWindow={project?.editorPreferences.timelineWindow || "auto"}
          onTimelineWindowChange={changeTimelineWindow}
          selectedClipId={selectedClipId}
          onSelectClip={setSelectedClipId}
          onMoveClip={moveSelectedProgramClip}
          onRemoveClip={removeSelectedProgramClip}
          onNudgeClip={nudgeSelectedProgramClip}
          sourceBrowserOpen={sourceBrowserOpen}
          onToggleSources={() => setSourceBrowserOpen((open) => !open)}
          />
        </div></>}
      </section>
    </main>{projectRail}</>
  );
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
      <div className="empty-header"><span className="empty-header-brand"><button className="projects-button" aria-label="Projects" title="Projects" onClick={onOpenProjects}><List size={22} weight="bold" /></button><span className="wordmark">Cutroom</span></span></div>
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
  if (status?.state === "queued" || status?.state === "exporting") return <div className="export-notice" role="status"><span>Exporting {Math.round(status.progress * 100)}%</span><progress max="1" value={status.progress} /><button onClick={onCancel}>Cancel</button></div>;
  if (status?.state === "failed" || status?.state === "cancelled") return <div className="export-notice failed" role="alert"><span>{status.error || status.message}</span><button onClick={onRetry}>Retry</button></div>;
  return null;
}

function Timeline({ project, mode, duration, ranges, thumbnails, waveform, playhead, pitchVisible, pitchArtifact, pitchStatus, onTogglePitch, onSeekRatio, onSeek, onTrimEnd, selectedOverlayId, onSelectOverlay, onOverlayTimingChange, onCandidateSelect, onCutoutTimingChange, timelineWindow, onTimelineWindowChange, selectedClipId, onSelectClip, onMoveClip, onRemoveClip, onNudgeClip, sourceBrowserOpen, onToggleSources }: TimelineProps) {
  const playheadRatio = Number.parseFloat(playhead) / 100 || 0;
  const timelineDuration = mode === "cut" ? cutDuration(ranges) : duration;
  const canvasWidth = `${timelineCanvasPercent(timelineDuration, timelineWindow)}%`;
  const multiSource = mode === "cut" && new Set(ranges.map((range) => range.sourceId)).size > 1;
  return (
    <section className="timeline-section">
      <div className="timeline-heading">
        <span className="timeline-title">{mode === "cut" ? "Edited cut" : "Original recording"}</span>
        <span className="timeline-heading-actions"><button className={sourceBrowserOpen ? "sources-toggle active" : "sources-toggle"} aria-expanded={sourceBrowserOpen} onClick={onToggleSources}>Sources</button><label className="timeline-window">Width<select aria-label="Timeline width" value={timelineWindow} onChange={(event) => onTimelineWindowChange(event.target.value as TimelineWindow)}><option value="auto">Auto</option><option value="15">15s</option><option value="60">1 min</option><option value="180">3 min</option><option value="300">5 min</option></select></label><button className={pitchVisible ? "pitch-toggle active" : "pitch-toggle"} aria-pressed={pitchVisible} onClick={onTogglePitch}>Pitch</button><span>{formatTime(timelineDuration)}</span></span>
      </div>
      <div className="timeline-viewport">
        <div className="timeline-canvas" style={{ width: canvasWidth }}>
          <div className="timeline-track-stack">
          <div className="timeline-track-label program-track-label">{mode === "cut" ? "Program" : "Recording"}</div>
          <div className={`timeline ${mode} timeline-track-content`} role="slider" tabIndex={0} aria-label="Video timeline" onClick={onSeek}>
            {multiSource ? <ProgramMediaStrip ranges={ranges} /> : <><ThumbnailStrip thumbnails={thumbnails} /><Waveform peaks={waveform} /></>}
            {mode === "original" ? <SourceHighlights ranges={ranges.filter((range) => range.sourceId === project?.mediaLibrary.primarySourceId)} duration={duration} /> : <CutDividers project={project} ranges={ranges} selectedId={selectedClipId} onSelect={onSelectClip} onTrimEnd={onTrimEnd} />}
            <TrackPlayhead playhead={playhead} />
          </div>
          {pitchVisible && <div className="timeline-wide-track"><PitchGraph artifact={pitchArtifact} mode={mode} ranges={ranges} duration={duration} playheadRatio={playheadRatio} status={pitchStatus} onSeekRatio={onSeekRatio} /></div>}
          {mode === "cut" && project && <ImageOverlayTracks project={project} ranges={ranges} playhead={playhead} selectedId={selectedOverlayId} onSelect={onSelectOverlay} onTimingChange={onOverlayTimingChange} onCandidateSelect={onCandidateSelect} />}
          {mode === "cut" && project && <CutoutOverlayTracks project={project} ranges={ranges} playhead={playhead} selectedId={selectedOverlayId} onSelect={onSelectOverlay} onTimingChange={onCutoutTimingChange} />}
          <div className="timeline-track-label timeline-scale-label" aria-hidden="true" />
          <div className="timeline-scale"><span>0:00</span><span>{formatTime(timelineDuration)}</span></div>
          </div>
        </div>
      </div>
      {mode === "cut" && project && <ProgramClipInspector project={project} selectedId={selectedClipId} onMove={onMoveClip} onRemove={onRemoveClip} onNudge={onNudgeClip} />}
    </section>
  );
}

function TrackPlayhead({ playhead }: { playhead: string }) {
  return <span className="track-playhead" aria-hidden="true" style={{ left: playhead }} />;
}

function ProgramClipInspector({ project, selectedId, onMove, onRemove, onNudge }: ProgramClipInspectorProps) {
  const index = project.programTimeline.clips.findIndex((clip) => clip.id === selectedId);
  const clip = project.programTimeline.clips[index];
  if (!clip) return null;
  return <div className="program-clip-inspector" aria-label={`Selected clip ${clip.label}`}><span><strong>{clip.kind === "scene" ? "Scene clip" : "Reference clip"}</strong><small>{clip.label} · {clip.sourceStart.toFixed(2)}–{clip.sourceEnd.toFixed(2)}s</small></span><div><button disabled={index === 0} onClick={() => onMove(-1)}>Earlier</button><button disabled={index === project.programTimeline.clips.length - 1} onClick={() => onMove(1)}>Later</button><button onClick={() => onNudge("start", 0.1)}>Trim start +0.1s</button><button onClick={() => onNudge("end", -0.1)}>Trim end −0.1s</button>{clip.kind === "source" && <button className="remove-program-clip" onClick={onRemove}>Remove</button>}</div></div>;
}

function AnalysisPanel({ project, duration, onSeek, onUpdate, onSelect, onMove }: AnalysisPanelProps) {
  return (
    <details className="analysis-panel" open>
      <summary>Scenes and takes <span>{project.scenes.length} scenes · {project.scenes.reduce((count, scene) => count + scene.takes.length, 0)} takes</span></summary>
      <p className="request-summary"><strong>Current interpretation:</strong> {project.requestSummary}</p>
      <div className="pipeline-map"><span>Video task</span><i>→</i><span>Parakeet words</span><i>→</i><span>Scenes</span><i>→</i><span>Takes</span><i>→</i><span>Selected cut</span></div>
      <div className="scene-list">{project.scenes.map((scene, index) => (
        <SceneRows key={scene.id} scene={scene} index={index} last={index === project.scenes.length - 1} duration={duration} onSeek={onSeek} onUpdate={onUpdate} onSelect={onSelect} onMove={onMove} />
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

function SceneRows({ scene, index, last, duration, onSeek, onUpdate, onSelect, onMove }: SceneRowsProps) {
  return (
    <section className="scene-group">
      <div className="scene-row"><b>{scene.order}</b><span><strong>{scene.label}</strong><small>{scene.reason}</small></span><em>{scene.takes.length} {scene.takes.length === 1 ? "take" : "takes"}</em><span className="row-actions"><button disabled={index === 0} onClick={() => onMove(scene.id, -1)}>Earlier</button><button disabled={last} onClick={() => onMove(scene.id, 1)}>Later</button></span></div>
      {scene.takes.map((take) => <TakeRow key={take.id} scene={scene} take={take} duration={duration} onSeek={onSeek} onUpdate={onUpdate} onSelect={onSelect} />)}
    </section>
  );
}

function TakeRow({ scene, take, duration, onSeek, onUpdate, onSelect }: TakeRowProps) {
  return (
    <div className={`take-row ${take.selected ? "selected" : ""}`}>
      <input type="radio" name={`scene-${scene.id}`} checked={take.selected} aria-label={`Select ${scene.label} ${take.label}`} onChange={() => onSelect(scene.id, take.id)} />
      <button className="take-name" onClick={() => onSeek(take.start)}>{take.label}</button>
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

function CutDividers({ project, ranges, selectedId, onSelect, onTrimEnd }: { project: VideoProject | null; ranges: SourceRange[]; selectedId: string | null; onSelect: (id: string) => void; onTrimEnd: TimelineTrimHandler }) {
  const [preview, setPreview] = useState<TimelineTrimPreview | null>(null);
  const total = cutDuration(ranges);
  return <>{timelineTrimPositions(ranges, preview).map(({ range, left, width, shortened }, index) => {
    const minimum = minimumTakeEnd(project, range);
    return <span className={`cut-divider ${range.kind === "source" ? "reference" : ""} ${selectedId === range.id ? "selected" : ""} ${shortened > 0 ? "trimming" : ""}`} key={range.id} style={segmentStyle(range, { left: `${left}%`, width: `${width}%` })}><button className="program-clip-label" aria-label={`Select ${timelineLabel(range)}`} onClick={() => onSelect(range.id)}>{timelineLabel(range)}</button>{shortened > 0 && <output className="trim-preview">−{shortened.toFixed(2)}s</output>}<TimelineTrimHandle range={range} before={cutDuration(ranges.slice(0, index))} minimum={minimum} total={total} onPreview={setPreview} onTrimEnd={onTrimEnd} /></span>;
  })}</>;
}

function TimelineTrimHandle({ range, before, minimum, total, onPreview, onTrimEnd }: TimelineTrimHandleProps) {
  const drag = useRef<TimelineTrimDrag | null>(null);
  function begin(event: ReactPointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const bounds = event.currentTarget.closest(".timeline")?.getBoundingClientRect();
    if (!bounds) return;
    drag.current = { left: bounds.left, width: bounds.width, before, minimum, total, maximum: range.end, next: range.end };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    event.stopPropagation();
    const cutTime = Math.min(drag.current.total, Math.max(0, ((event.clientX - drag.current.left) / drag.current.width) * drag.current.total));
    drag.current.next = Math.min(drag.current.maximum, Math.max(drag.current.minimum, range.start + cutTime - drag.current.before));
    onPreview({ rangeId: range.id, end: drag.current.next });
  }
  function finish(event: ReactPointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const next = drag.current?.next;
    drag.current = null;
    onPreview(null);
    if (next !== undefined) onTrimEnd(range.id, next, true);
  }
  function nudge(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft") return;
    event.preventDefault();
    event.stopPropagation();
    onTrimEnd(range.id, Math.max(minimum, range.end - (event.shiftKey ? 0.4 : 0.04)), true);
  }
  return <button className="trim-end-handle" aria-label={`Trim end of ${timelineLabel(range)}`} title={`Drag left to shorten ${timelineLabel(range)}`} onClick={(event) => event.stopPropagation()} onKeyDown={nudge} onPointerCancel={finish} onPointerDown={begin} onPointerMove={move} onPointerUp={finish} />;
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
  return { jobId: "export-ui-error", projectId, preset, state: "failed", progress: 0, message: "Export failed.", receipt: null, error: error instanceof Error ? error.message : String(error), startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() };
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

function activeSourceId(url: string): string | null {
  return decodeURIComponent(url.match(/\/media\/(media\.[a-z0-9.]+)$/)?.[1] || "") || null;
}

function useObjectUrlCleanup(source: SourceState) {
  useEffect(() => () => {
    if (source.objectUrl) URL.revokeObjectURL(source.url);
  }, [source]);
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
type TimelineProps = { project: VideoProject | null; mode: ViewMode; duration: number; ranges: SourceRange[]; thumbnails: string[]; waveform: number[]; playhead: string; pitchVisible: boolean; pitchArtifact: PitchArtifact | null; pitchStatus: PitchStatus; onTogglePitch: () => void; onSeekRatio: (ratio: number) => void; onSeek: (event: MouseEvent<HTMLDivElement>) => void; onTrimEnd: TimelineTrimHandler; selectedOverlayId: string | null; onSelectOverlay: (id: string, start: number) => void; onOverlayTimingChange: (id: string, start: number, end: number, commit: boolean) => void; onCandidateSelect: (bundleId: string, assetId: string) => void; onCutoutTimingChange: (id: string, start: number, end: number, commit: boolean) => void; timelineWindow: TimelineWindow; onTimelineWindowChange: (window: TimelineWindow) => void; selectedClipId: string | null; onSelectClip: (id: string) => void; onMoveClip: (direction: -1 | 1) => void; onRemoveClip: () => void; onNudgeClip: (edge: "start" | "end", delta: number) => void; sourceBrowserOpen: boolean; onToggleSources: () => void };
type ExportNoticeProps = { status: ExportJobStatus | null; onCancel: () => void; onRetry: () => void };
type AnalysisPanelProps = { project: VideoProject; duration: number; onSeek: (time: number, index?: number) => void; onUpdate: (sceneId: string, takeId: string, edge: "start" | "end", value: number) => void; onSelect: (sceneId: string, takeId: string) => void; onMove: (id: string, direction: -1 | 1) => void };
type SceneRowsProps = Omit<AnalysisPanelProps, "project"> & { scene: SceneProposal; index: number; last: boolean };
type TakeRowProps = Pick<AnalysisPanelProps, "duration" | "onSeek" | "onUpdate" | "onSelect"> & { scene: SceneProposal; take: TakeProposal };
type TimelineTrimHandler = (clipId: string, end: number, commit: boolean) => void;
type TimelineTrimHandleProps = { range: SourceRange; before: number; minimum: number; total: number; onPreview: (preview: TimelineTrimPreview | null) => void; onTrimEnd: TimelineTrimHandler };
type TimelineTrimDrag = { left: number; width: number; before: number; minimum: number; total: number; maximum: number; next: number };
type ProgramClipInspectorProps = { project: VideoProject; selectedId: string | null; onMove: (direction: -1 | 1) => void; onRemove: () => void; onNudge: (edge: "start" | "end", delta: number) => void };
type PendingMediaLoad = { time: number; rangeIndex: number; play: boolean };
const segmentColors = ["#61d6b3", "#8ea7ff", "#f0a45d", "#d98cff", "#f06f8d"];

import { ArrowsOut, Export as ExportIcon, FilmStrip, List, Pause, Play, SpeakerHigh, SpeakerSlash } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type CSSProperties, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type SetStateAction } from "react";
import type { CutProposal, ExportPreset, OverlayLayout, ProgramClip, ProjectTrashReceipt, SceneProposal, TakeProposal, TimelineWindow, VideoMediaSource, VideoProject } from "./analysis-model";
import { createAudioPeaks } from "./audio-waveform";
import { cutDuration, cutTimeFromSource, formatTime, sourceLocationFromCutTime, type SourceRange, type ViewMode } from "./editor-model";
import { EditableOverlayStage, ImageOverlayTracks } from "./ImageOverlayEditors";
import { selectImageBundleCandidate } from "./ImageBundleModel";
import { createVideoThumbnails } from "./media-thumbnails";
import type { ExportJobStatus } from "./ExportModel";
import { PitchGraph, type PitchStatus } from "./PitchGraph";
import type { PitchArtifact } from "./PitchModel";
import { handlePageSpace, playbackDecision } from "./PlaybackShortcut";
import { selectedCutsFromScenes } from "./ProjectCutModel";
import { timelineTrimPositions, type TimelineTrimPreview } from "./TimelineTrimPreviewModel";
import { imageOverlayWithCutInterval } from "./overlay-model";
import { logError, logEvent } from "./structured-log";
import { ProjectSaveQueue, type ProjectSaveStatus } from "./ProjectSaveQueue";
import { timelineCanvasPercent } from "./TimelineWindowModel";
import { ProjectRail } from "./ProjectRail";
import { displayProjectTitle } from "./ProjectTitle";
import { insertProgramClip, moveProgramClip, programRanges, removeProgramClip, sourceProgramClip, syncSceneClip, trimProgramClip } from "./ProgramTimelineModel";
import { SourceBrowser } from "./SourceBrowser";
import { CutoutOverlayStage, CutoutOverlayTracks } from "./CutoutOverlayEditors";
import { cutoutWithProgramInterval } from "./CutoutOverlayModel";
import type { CreateCutoutInput, CutoutJobStatus } from "./CutoutModel";
import { legacyProjectRedirect, projectIdFromLocation } from "./ProjectRoute";
