"""
Patram-7B (BharatGen, Apache-2.0) behind a small OpenAI-compatible endpoint, for SANKALP's self-hosted vision (D-057).
Runs on your own GPU server in India; SANKALP calls POST /v1/chat/completions with a text prompt and one image.

    PATRAM_MODEL_DIR=/opt/patram/model PATRAM_API_KEY=... uvicorn patram_server:app --host 127.0.0.1 --port 8000

Only what SANKALP sends is supported: one user message with text and one image (data: URL). Nothing is logged except
timings; images are never written to disk.
"""
import base64, binascii, io, os, secrets, time

import torch
from fastapi import FastAPI, Header, HTTPException
from PIL import Image
from pydantic import BaseModel
from transformers import pipeline

MODEL_DIR = os.environ.get("PATRAM_MODEL_DIR", "/opt/patram/model")
API_KEY = os.environ.get("PATRAM_API_KEY", "")
MAX_IMAGE_BYTES = 12 * 1024 * 1024

if not API_KEY:
    raise SystemExit("Set PATRAM_API_KEY (the same value goes into SANKALP's AI_VISION_API_KEY)")

pipe = pipeline("image-text-to-text", model=MODEL_DIR, trust_remote_code=True, device_map="auto", torch_dtype=torch.bfloat16)
app = FastAPI(title="Patram-7B for SANKALP", docs_url=None, redoc_url=None, openapi_url=None)


class ChatRequest(BaseModel):
    model: str | None = None
    messages: list[dict]
    max_tokens: int | None = 300
    temperature: float | None = 0.2


def _image(url: str) -> Image.Image:
    if not url.startswith("data:image/") or ";base64," not in url:
        raise HTTPException(400, "image_url must be a data: URL (remote URLs are not fetched)")
    try:
        raw = base64.b64decode(url.split(";base64,", 1)[1], validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "invalid base64 image")
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "image too large")
    img = Image.open(io.BytesIO(raw))
    img.thumbnail((1536, 1536))
    return img.convert("RGB")


@app.get("/health")
def health():
    return {"ok": True, "model": "patram-7b-instruct", "cuda": torch.cuda.is_available()}


@app.post("/v1/chat/completions")
def chat(req: ChatRequest, authorization: str = Header(default="")):
    if not secrets.compare_digest(authorization, f"Bearer {API_KEY}"):
        raise HTTPException(401, "unauthorized")
    user = next((m for m in reversed(req.messages) if m.get("role") == "user"), None)
    if not user or not isinstance(user.get("content"), list):
        raise HTTPException(400, "expected one user message with text and image parts")
    text = " ".join(p.get("text", "") for p in user["content"] if p.get("type") == "text").strip()
    imgs = [_image(p["image_url"]["url"]) for p in user["content"] if p.get("type") == "image_url"]
    if not text or len(imgs) != 1:
        raise HTTPException(400, "send exactly one image and a text prompt")
    t0 = time.time()
    out = pipe(text=[{"role": "user", "content": [{"type": "image", "image": imgs[0]}, {"type": "text", "text": text}]}],
               max_new_tokens=min(max(req.max_tokens or 300, 16), 1024), return_full_text=False)
    gen = out[0]["generated_text"] if out else ""
    if isinstance(gen, list):  # chat-style output: take the assistant's last turn
        gen = next((m.get("content", "") for m in reversed(gen) if m.get("role") == "assistant"), "")
    answer = str(gen).strip()
    return {
        "id": f"patram-{int(t0 * 1000)}", "object": "chat.completion", "created": int(t0), "model": "patram-7b-instruct",
        "choices": [{"index": 0, "message": {"role": "assistant", "content": answer}, "finish_reason": "stop"}],
        "usage": {"latency_ms": int((time.time() - t0) * 1000)},
    }
