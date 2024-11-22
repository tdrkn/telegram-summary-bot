# telegram group summary bot

Feel scared when seeing 2000+ unread in groups? Now you can read them by LLM!

Use d1, cf worker, ai gateway, gemini-1.5-flash.

## Setup

bot: <https://github.com/codebam/cf-workers-telegram-bot>

d1: <https://developers.cloudflare.com/d1/get-started/>

ai gateway: <https://developers.cloudflare.com/ai-gateway/>

TODO: write more deploy steps.

## Usage

/summary

summarize 24h message

/query word

can search cjk

/status

check bot is alive

## Cost

0

d1: telegram bot can't read info in the history, only newly sent info, so use database to keep them. [pricing](https://developers.cloudflare.com/d1/platform/pricing/#billing-metrics)

cf worker: so no more offline.(I hope so) [pricing](https://developers.cloudflare.com/workers/platform/pricing/#workers)

gemini-1.5-flash: [free for limited usage and huge context](https://ai.google.dev/pricing?hl=zh-cn#1_5flash)

---

Data will be kept for 1 month, may change in the future.

---

## TODO

add method to import group history information so history info can be searched.

maybe auto-delte query result
