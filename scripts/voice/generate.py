"""Generate voice-line audio with Kokoro (free, Apache-2.0 neural TTS).

Reads scripts/voice/lines.json (from collect-lines.mjs) and writes
public/audio/voice/<id>.mp3 plus public/audio/voice/manifest.json.
Lines that already have a file are skipped, so re-running only makes new lines.

Setup (once):  bash scripts/voice/setup-kokoro.sh <model-dir>
Run:           <venv>/bin/python scripts/voice/generate.py --model-dir <model-dir>

Family recordings can replace any file later: keep the same file name.
"""

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "audio" / "voice"

# Co-pilot: warm and clear. Tower: a different voice, band-limited like a real radio.
VOICES = {
    "copilot": {"voice": "af_heart", "speed": 0.95, "radio": False},
    "tower": {"voice": "am_michael", "speed": 1.05, "radio": True},
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model-dir", required=True, help="folder with model_quantized.onnx and voices.npz")
    ap.add_argument("--force", action="store_true", help="regenerate every line")
    args = ap.parse_args()

    import soundfile as sf  # noqa: PLC0415
    from kokoro_onnx import Kokoro  # noqa: PLC0415

    model_dir = Path(args.model_dir)
    kokoro = Kokoro(str(model_dir / "model_quantized.onnx"), str(model_dir / "voices.npz"))

    lines = json.loads((ROOT / "scripts" / "voice" / "lines.json").read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}

    made = 0
    for line in lines:
        name = f"{line['id']}.mp3"
        target = OUT / name
        if target.exists() and not args.force:
            manifest[line["id"]] = name
            continue
        cfg = VOICES[line["who"]]
        audio, sr = kokoro.create(line["speak"], voice=cfg["voice"], speed=cfg["speed"], lang="en-us")
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            sf.write(tmp.name, audio, sr)
            filters = ["silenceremove=start_periods=1:start_threshold=-45dB"]
            if cfg["radio"]:
                filters += ["highpass=f=320", "lowpass=f=3200", "acompressor=threshold=-18dB:ratio=4", "volume=1.6"]
            filters += ["apad=pad_dur=0.15", "loudnorm=I=-16:TP=-1.5:LRA=11"]
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", tmp.name, "-af", ",".join(filters),
                 "-ac", "1", "-ar", "24000", "-codec:a", "libmp3lame", "-b:a", "56k", str(target)],
                check=True,
            )
        manifest[line["id"]] = name
        made += 1
        print(f"[{line['who']}] {line['text']}")

    # Drop entries for lines that no longer exist.
    ids = {l["id"] for l in lines}
    manifest = {k: v for k, v in manifest.items() if k in ids}
    manifest_path.write_text(json.dumps(manifest, indent=0, sort_keys=True))
    print(f"made {made} new files, {len(manifest)} lines in manifest")
    return 0


if __name__ == "__main__":
    sys.exit(main())
