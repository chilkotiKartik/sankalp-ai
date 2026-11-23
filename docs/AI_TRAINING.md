# SANKALP's own AI: training data and self-hosted models

Everything here runs on Indian infrastructure. No photo or text goes to a foreign service.

## What runs today
| Task | Model | Where |
|---|---|---|
| Complaint understanding (any Indian language → category, department, urgency) | `sarvam-105b` (Sarvam AI) | Sarvam, India |
| Photo analysis ("what is this problem?", "is it fixed?") | `gemma4` on Sarvam `/v2` | Sarvam, India |
| Fallback when AI is off or unsure | keyword rules / manual review by an officer | your server |

The AI never closes a case on its own. A case closes only with proof and the citizen's own confirmation (MASTER_PROMPT §7.1).

## Real training data (no made-up labels)
1. **Consent.** People switch on *Profile → Privacy & my data → Help improve SANKALP's AI*. It is off by default, separate from the main notice (DPDP purpose limitation), can be withdrawn at any time, and both changes are audit-logged.
2. **Labels.** The labels come from what really happened:
   - `scene` (before photo → problem type): only complaints an officer actually worked (ASSIGNED and later), labelled with the final category.
   - `fixed` (proof photo → fixed / not_fixed): the citizen's own yes/no answer.
3. **Export** (state admin only, audited):
   ```bash
   SANKALP_URL=https://sankalpai.app SANKALP_TENANT=kerala SANKALP_TOKEN=<state admin token> node scripts/export-training.mjs ./dataset
   ```
   It writes `dataset/images/<task>/<label>/…` and `dataset/labels.jsonl`. Only the EXIF-stripped copies are used, with no GPS. Keep the dataset on Indian machines; it is personal data.

## Training plan (on your GPU in India)
1. Wait for enough real examples: at least ~200 per category for `scene` and ~300 each of fixed / not_fixed. Fewer gives misleading accuracy.
2. Split by complaint, not by photo, so the same place never appears in both train and test (80/20). Keep a fixed test set.
3. Fine-tune a small image classifier, for example EfficientNet or ViT-B/16, with one head per task. It trains in under an hour on one L4 and runs on CPU afterwards. Alternatively, LoRA-tune Patram-7B on the same data.
4. **Release rule:** replace the live model only if it beats the current one (Sarvam `gemma4`) on the fixed test set: per-category F1 and the false "fixed" rate. Report both, and keep the vision signal as one input to verification, never the decision.
5. Re-train monthly as more consented, confirmed cases arrive.

## Self-hosting Patram-7B (BharatGen)
Patram-7B is BharatGen's (Government of India) 7.7B vision-language model, Apache-2.0. It is strongest on **documents**: OCR, forms, tables, key-value extraction from Indian documents. Use it for reading notices, scheme documents and uploaded paperwork. For street-photo classification, a model fine-tuned on SANKALP's own labelled data (above) is the better tool.

1. On Hugging Face, accept the terms at `bharatgenai/patram-7b-instruct` (the model is gated) and create a read token.
2. Rent a GPU VM **in India** with one NVIDIA GPU of at least 24 GB (L4 / A10 / A100), Ubuntu with the NVIDIA driver. Examples: E2E Networks, Yotta, or a cloud provider's Mumbai/Hyderabad region.
3. On the GPU VM:
   ```bash
   sudo HF_TOKEN=hf_... bash deploy/gpu/setup-patram.sh <gpu-public-ip> <sankalp-server-ip>
   ```
   It downloads the weights once (~15 GB), runs an OpenAI-compatible endpoint behind HTTPS reachable only from the SANKALP server, and generates an API key in `/etc/patram.env`.
4. On the SANKALP server:
   ```bash
   bash /root/sankalp-ai/deploy/set-keys.sh patram https://<gpu-ip-with-dashes>.sslip.io/v1 <PATRAM_API_KEY>
   ```
   It tests the server first and changes nothing if the test fails. To switch back, set `AI_VISION_PROVIDER=sarvam`.

`deploy/gpu/patram_server.py` follows the model card's `transformers` usage (`trust_remote_code`). It has **not yet been run on a GPU**, so check `/health` and one test photo after setup.
