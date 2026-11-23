// One Sarvam AI chat completion, to check the key works. Run: node --env-file=.env scripts/sarvam-hello.mjs
// The key is read from SARVAM_API_KEY (in the git-ignored .env); it is never printed.
import { SarvamAIClient } from "sarvamai";

if (!process.env.SARVAM_API_KEY) {
  console.error("SARVAM_API_KEY is not set. Put it in .env and run: node --env-file=.env scripts/sarvam-hello.mjs");
  process.exit(1);
}

const client = new SarvamAIClient({ apiSubscriptionKey: process.env.SARVAM_API_KEY });
const response = await client.chat.completions({
  model: "sarvam-105b",
  messages: [{ role: "user", content: "In one sentence, what is a civic grievance?" }],
});
console.log(response.choices[0].message.content);
