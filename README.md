# telegram group summary bot

Feel scared when seeing 2000+ unread in groups? Now you can read them by LLM!

Use d1, cf worker, gemini-1.5-8b.

see <https://github.com/codebam/cf-workers-telegram-bot> for more deploy details

setup d1: <https://developers.cloudflare.com/d1/get-started/>

TODO: write more deploy steps.

## Cost

d1: telegram bot can't read info in the history, only newly sent info, so use database to keep them. [pricing](https://developers.cloudflare.com/d1/platform/pricing/#billing-metrics)

cf worker: so no more offline.(I hope so) [pricing](https://developers.cloudflare.com/workers/platform/pricing/#workers)

gemini-1.5-8b: [free for limited usage and huge context](https://ai.google.dev/pricing?hl=zh-cn#1_5flash-8B)

---

Data will be kept for 1 month, may change in the future.

Nth day's summary will include [N-1, N] 2 days, which called [ListCorrelate](https://reference.wolfram.com/language/ref/ListCorrelate.html)
