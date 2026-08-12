"""
Local speech-to-text service for Live Transcriber's "Browser tab / window" and
"Uploaded video" modes — runs faster-whisper on your own machine instead of
calling a paid API.

Setup (one-time):
    pip install -r requirements.txt

Run (leave this running in a terminal while using Live Transcriber):
    python server.py

Listens on http://127.0.0.1:8008 by default. The Next.js app's /api/transcribe
route calls this URL (override with the WHISPER_SERVICE_URL env var if you
host this elsewhere, e.g. a VPS).

The first request after startup downloads the model from Hugging Face and
caches it locally (~500MB for the default "small" size) — later starts are
instant.
"""
import os
import tempfile

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse
from faster_whisper import WhisperModel

MODEL_SIZE = os.environ.get("WHISPER_MODEL", "small")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
PORT = int(os.environ.get("PORT", "8008"))

app = FastAPI()

print(f"[whisper-transcriber] loading model '{MODEL_SIZE}' ({COMPUTE_TYPE}) — one-time on startup...")
model = WhisperModel(MODEL_SIZE, device="cpu", compute_type=COMPUTE_TYPE)
print("[whisper-transcriber] model loaded — ready for requests.")


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_SIZE}


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...), language: str = Form("")):
    data = await audio.read()
    if not data:
        return JSONResponse({"error": "Empty audio."}, status_code=400)

    # faster-whisper needs a seekable file path; chunks arrive as webm/opus blobs.
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
        f.write(data)
        path = f.name

    try:
        segments, _info = model.transcribe(
            path,
            language=language.strip() or None,
            beam_size=1,
            vad_filter=True,  # skip silent stretches instead of hallucinating text
        )
        text = "".join(seg.text for seg in segments).strip()
        return {"text": text}
    except Exception as e:  # noqa: BLE001 — surface any decode/model error to the caller
        return JSONResponse({"error": str(e)}, status_code=500)
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=PORT)
