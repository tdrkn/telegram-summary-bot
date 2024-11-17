# telegram group summary bot

see <https://github.com/codebam/cf-workers-telegram-bot> for more details

Use d1, cf worker, gemini-1.5-8b.

```sh
npx wrangler d1 execute chat-msg-d1 --remote --file=./schema.sql
```

TODO: write more deploy steps.

## Cost

d1: telegram bot can't read info in the history, only newly sent info, so use database to keep them. [pricing](https://developers.cloudflare.com/d1/platform/pricing/#billing-metrics)
cf worker: so no more offline.(I hope so) [pricing](https://developers.cloudflare.com/workers/platform/pricing/#workers)
gemini-1.5-8b: [free for limited usage and huge context](https://ai.google.dev/pricing?hl=zh-cn#1_5flash-8B)
