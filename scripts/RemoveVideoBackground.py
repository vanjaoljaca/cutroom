"""Runtime constraint: rembg's supported local inference API is Python-only."""

def main() -> None:
    width, height, frames = map(int, sys.argv[1:4])
    session = coreml_session()
    frame_bytes = width * height * 3
    index = 0
    while True:
        data = read_exact(frame_bytes)
        if not data:
            break
        index += 1
        if len(data) != frame_bytes:
            raise RuntimeError(f"Decoder emitted a partial frame after {index - 1} complete frames.")
        image = Image.frombytes("RGB", (width, height), data).convert("RGBA")
        result = remove(image, session=session, post_process_mask=True)
        sys.stdout.buffer.write(result.tobytes())
        sys.stdout.buffer.flush()
        progress(index, frames)
    if index == 0:
        raise RuntimeError("Decoder produced no cutout frames.")
    event("stream_completed", frame=index, frames=index)


def read_exact(size: int) -> bytes:
    chunks = bytearray()
    while len(chunks) < size:
        chunk = sys.stdin.buffer.read(size - len(chunks))
        if not chunk:
            break
        chunks.extend(chunk)
    return bytes(chunks)


def coreml_session():
    available = ort.get_available_providers()
    if "CoreMLExecutionProvider" not in available:
        raise RuntimeError("CoreML person segmentation is unavailable; CPU fallback is disabled.")
    providers = [("CoreMLExecutionProvider", {"MLComputeUnits": "ALL", "RequireStaticInputShapes": "0", "EnableOnSubgraphs": "1"})]
    session = new_session("u2net_human_seg", providers=providers)
    active = session.inner_session.get_providers()
    if not active or active[0] != "CoreMLExecutionProvider":
        raise RuntimeError(f"CoreML provider did not activate: {active}")
    event("backend_ready", providers=active, backend="onnxruntime-coreml", computeUnits="ALL")
    return session


def progress(frame: int, frames: int) -> None:
    if frame == 1 or frame == frames or frame % 10 == 0:
        event("frame_processed", frame=frame, frames=frames)


def event(name: str, **details: object) -> None:
    print(json.dumps({"scope": "cutroom-cutout", "event": name, **details}), file=sys.stderr, flush=True)


import json
import sys
from PIL import Image
from rembg import new_session, remove
import onnxruntime as ort

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        event("processing_failed", error=str(error))
        raise
