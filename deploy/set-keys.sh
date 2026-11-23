#!/usr/bin/env bash
# Add provider keys to a running SANKALP server and test them live (D-054). Run as root on the server, e.g. from
# Azure portal → sankalp-vm → Run command → RunShellScript:
#
#   bash /root/sankalp-ai/deploy/set-keys.sh sarvam <SARVAM_API_KEY> [model]
#   bash /root/sankalp-ai/deploy/set-keys.sh datagov <DATAGOV_API_KEY>       (data.gov.in: live mandi prices and more)
#   bash /root/sankalp-ai/deploy/set-keys.sh patram <https://gpu-host/v1> <PATRAM_API_KEY>   (own Patram-7B, deploy/gpu)
#   bash /root/sankalp-ai/deploy/set-keys.sh msg91 <MSG91_AUTH_KEY> '<template ids JSON>' [test-mobile]
#        template ids JSON: {"otp":"<MSG91 template id>","status_update":"…","verify_request":"…"}
#        (each id is a DLT-approved template in MSG91; variables in the template are ##var1##, ##var2##…)
#
# Keys go only into /etc/sankalp/sankalp.env (mode 0600) — never into git, logs or this script's output.
# Only the provider's own host is added to EGRESS_ALLOWLIST.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run as root"; exit 1; }
ENV=/etc/sankalp/sankalp.env
[ -f "$ENV" ] || { echo "SANKALP is not installed here ($ENV missing)"; exit 1; }
set_env() { grep -q "^$1=" "$ENV" && sed -i "s|^$1=.*|$1=$2|" "$ENV" || echo "$1=$2" >> "$ENV"; }
allow_host() {
  local cur; cur="$(grep -E '^EGRESS_ALLOWLIST=' "$ENV" | cut -d= -f2- || true)"
  case ",$cur," in *",$1,"*) ;; *) set_env EGRESS_ALLOWLIST "${cur:+$cur,}$1" ;; esac
}
restart() {
  systemctl restart sankalp
  for _ in $(seq 1 40); do curl -fsS http://127.0.0.1:5000/readyz >/dev/null 2>&1 && return 0; sleep 1; done
  echo "✗ SANKALP did not come back up — check: journalctl -u sankalp -n 50"; exit 1
}

case "${1:-}" in
  sarvam)
    KEY="${2:?usage: set-keys.sh sarvam <SARVAM_API_KEY> [model]}"; MODEL="${3:-$(grep -E '^SARVAM_MODEL=' "$ENV" | cut -d= -f2- || true)}"; MODEL="${MODEL:-sarvam-105b}"
    echo "Testing the key with Sarvam (model $MODEL)…"
    CODE=$(curl -s -o /tmp/sarvam-test.json -w "%{http_code}" -m 60 https://api.sarvam.ai/v2/chat/completions \
      -H "api-subscription-key: $KEY" -H "Content-Type: application/json" \
      -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with the single word OK\"}],\"max_tokens\":20,\"reasoning_effort\":\"none\"}")
    if [ "$CODE" != 200 ]; then
      echo "✗ Sarvam answered HTTP $CODE: $(head -c 300 /tmp/sarvam-test.json)"; rm -f /tmp/sarvam-test.json
      echo "  Nothing was changed. If the model name is the problem, re-run with the model your Sarvam dashboard lists, e.g.: set-keys.sh sarvam <key> sarvam-m"
      exit 1
    fi
    rm -f /tmp/sarvam-test.json
    set_env SARVAM_API_KEY "$KEY"; set_env SARVAM_MODEL "$MODEL"; allow_host api.sarvam.ai; restart
    echo "✓ Sarvam AI is on: $(curl -s http://127.0.0.1:5000/api/public/config | python3 -c 'import json,sys;print(json.load(sys.stdin)["ai"])')"
    ;;
  msg91)
    KEY="${2:?usage: set-keys.sh msg91 <MSG91_AUTH_KEY> '<template ids JSON>' [test-mobile]}"; IDS="${3:?template ids JSON required}"; PHONE="${4:-}"
    printf '%s' "$IDS" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert isinstance(d,dict) and all(isinstance(v,str) and v for v in d.values())' \
      || { echo "✗ template ids must be JSON like {\"otp\":\"<id>\"}"; exit 1; }
    IDS_ONE_LINE="$(printf '%s' "$IDS" | python3 -c 'import json,sys;print(json.dumps(json.load(sys.stdin),separators=(",",":")))')"
    set_env SMS_DRIVER msg91; set_env MSG91_AUTH_KEY "$KEY"; set_env SMS_TEMPLATE_IDS "'$IDS_ONE_LINE'"; allow_host control.msg91.com; restart
    echo "✓ SMS via MSG91 is on for: $(printf '%s' "$IDS" | python3 -c 'import json,sys;print(", ".join(json.load(sys.stdin)))')"
    if [ -n "$PHONE" ]; then
      OTP_ID="$(printf '%s' "$IDS" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("otp",""))')"
      [ -n "$OTP_ID" ] || { echo "  (no otp template id, so no test SMS sent)"; exit 0; }
      echo "Sending a test code to the number you gave…"
      curl -s -m 30 https://control.msg91.com/api/v5/flow -H "authkey: $KEY" -H "Content-Type: application/json" \
        -d "{\"template_id\":\"$OTP_ID\",\"short_url\":\"0\",\"recipients\":[{\"mobiles\":\"91$PHONE\",\"var1\":\"$(shuf -i 100000-999999 -n 1)\"}]}"; echo
      echo "  MSG91's answer is above: \"type\":\"success\" means it was accepted. Check the phone."
    fi
    ;;
  datagov)
    KEY="${2:?usage: set-keys.sh datagov <DATAGOV_API_KEY>}"
    echo "Testing the key with data.gov.in (daily mandi prices)…"
    CODE=$(curl -s -o /tmp/datagov-test.json -w "%{http_code}" -m 40 "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070?api-key=$KEY&format=json&limit=1")
    if [ "$CODE" != 200 ] || ! grep -q '"records"' /tmp/datagov-test.json; then
      echo "✗ data.gov.in answered HTTP $CODE: $(head -c 200 /tmp/datagov-test.json | sed "s/$KEY/[key]/g"). Nothing was changed."; rm -f /tmp/datagov-test.json; exit 1
    fi
    rm -f /tmp/datagov-test.json
    set_env DATAGOV_API_KEY "$KEY"; allow_host api.data.gov.in; restart
    echo "✓ data.gov.in is on. Check: curl -s 'http://127.0.0.1:5000/api/public/mandi-prices' -H 'X-Tenant: kerala' | head -c 300"
    ;;
  patram)
    URL="${2:?usage: set-keys.sh patram <https://gpu-host/v1> <PATRAM_API_KEY>}"; KEY="${3:?PATRAM_API_KEY required}"
    case "$URL" in https://*/v1) ;; *) echo "✗ the URL must look like https://<gpu-host>/v1"; exit 1 ;; esac
    HOST="$(printf '%s' "$URL" | sed -E 's#^https://([^/]+)/.*#\1#')"
    echo "Testing the Patram server…"
    CODE=$(curl -s -o /tmp/patram-test.json -w "%{http_code}" -m 30 "${URL%/v1}/health")
    if [ "$CODE" != 200 ]; then echo "✗ Patram answered HTTP $CODE: $(head -c 200 /tmp/patram-test.json). Nothing was changed."; rm -f /tmp/patram-test.json; exit 1; fi
    rm -f /tmp/patram-test.json
    set_env AI_VISION_PROVIDER selfhosted; set_env AI_VISION_BASE_URL "$URL"; set_env AI_VISION_MODEL patram-7b-instruct; set_env AI_VISION_API_KEY "$KEY"
    allow_host "$HOST"; restart
    echo "✓ Photos are now analysed by your own Patram-7B: $(curl -s http://127.0.0.1:5000/api/public/config | python3 -c 'import json,sys;print(json.load(sys.stdin)["ai"])')"
    echo "  To switch back to Sarvam: set AI_VISION_PROVIDER=sarvam in /etc/sankalp/sankalp.env and restart."
    ;;
  *) sed -n 2,12p "$0"; exit 1 ;;
esac
