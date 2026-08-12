# Local Whisper Transcriber

Backs the **Live Transcriber** utility's "Browser tab / window" and "Uploaded
video" modes with a free, local speech-to-text model ([faster-whisper](https://github.com/SYSTRAN/faster-whisper))
instead of a paid API. The "Microphone" mode doesn't need this — it runs
entirely in the browser via the Web Speech API.

## Setup (one-time)
```
pip install -r requirements.txt
```

## Run
```
python server.py
```
Leave this running in a terminal whenever you want to use those two modes.
Listens on `http://127.0.0.1:8008`. The first request downloads and caches the
model from Hugging Face (~500MB for the default "small" size); after that,
startup is instant.

## Config (optional env vars)
| Var | Default | Notes |
|---|---|---|
| `WHISPER_MODEL` | `small` | `tiny` / `base` / `small` / `medium` / `large-v3` — bigger = more accurate, more RAM, slower |
| `WHISPER_COMPUTE_TYPE` | `int8` | `int8` (fastest, lowest RAM) or `float32` |
| `PORT` | `8008` | |

## Pointing the app at a different host
By default the Next.js app calls `http://127.0.0.1:8008`. If you run this
service elsewhere (a VPS, another machine on your network), set
`WHISPER_SERVICE_URL` in the Next.js app's environment to that service's URL.

## Load, roughly
With the default `small` model: ~2GB RAM once loaded, ~1s of CPU per 6-second
audio chunk (~15–20% of one core sustained while a session is active). Fine
on any machine from the last several years for single-user use.
