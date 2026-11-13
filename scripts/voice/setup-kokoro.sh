#!/usr/bin/env bash
# Downloads the free Kokoro-82M TTS model (Apache-2.0) and its voices from npm, then sets up
# a Python virtualenv to run scripts/voice/generate.py.
#   Model weights: npm package kokoro-q8-shards (byte-identical to onnx-community/Kokoro-82M-v1.0-ONNX q8)
#   Voices:        npm package kokoro-js (official, bundles the voice style files)
# Usage: bash scripts/voice/setup-kokoro.sh <model-dir>
set -euo pipefail
DIR="${1:?usage: setup-kokoro.sh <model-dir>}"
mkdir -p "$DIR/dl" "$DIR/voices"
cd "$DIR/dl"

npm pack kokoro-q8-shards@1.0.0 --silent >/dev/null
npm pack kokoro-js@1.2.1 --silent >/dev/null
tar xzf kokoro-q8-shards-1.0.0.tgz
cat package/kokoro-q8.part*.bin > ../model_quantized.onnx
echo "fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478  ../model_quantized.onnx" | sha256sum -c -
rm -rf package
tar xzf kokoro-js-1.2.1.tgz package/voices
cp package/voices/a*.bin package/voices/b*.bin ../voices/
cd ..

python3 -m venv venv
./venv/bin/pip install -q onnxruntime kokoro-onnx soundfile numpy
./venv/bin/python - <<'EOF'
import glob, os
import numpy as np
voices = {os.path.basename(f)[:-4]: np.fromfile(f, dtype=np.float32).reshape(-1, 1, 256) for f in sorted(glob.glob("voices/*.bin"))}
np.savez("voices.npz", **voices)
print(len(voices), "voices ready")
EOF
echo "Kokoro ready in $DIR. Next:"
echo "  node scripts/voice/collect-lines.mjs && $DIR/venv/bin/python scripts/voice/generate.py --model-dir $DIR"
