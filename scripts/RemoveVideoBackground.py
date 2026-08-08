"""Runtime constraint: rembg's supported local inference API is Python-only."""

import json
import sys
from pathlib import Path

from PIL import Image
from rembg import new_session, remove


def main() -> None:
    source = Path(sys.argv[1])
    output = Path(sys.argv[2])
    files = sorted(source.glob("*.png"))
    if not files:
        raise RuntimeError("No cutout frames were extracted.")
    output.mkdir(parents=True, exist_ok=True)
    session = new_session("u2net_human_seg")
    for index, path in enumerate(files, start=1):
        image = Image.open(path).convert("RGBA")
        result = remove(image, session=session, post_process_mask=True)
        result.save(output / path.name)
        if index == 1 or index == len(files) or index % 10 == 0:
            print(json.dumps({"scope": "cutroom-cutout", "event": "frame_processed", "frame": index, "frames": len(files)}), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"scope": "cutroom-cutout", "event": "processing_failed", "error": str(error)}), file=sys.stderr, flush=True)
        raise
