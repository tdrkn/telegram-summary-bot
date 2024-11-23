# telegram group summary bot

Feel scared when seeing 2000+ unread in groups? Now you can read them by LLM!

Use d1, cf worker, ai gateway, gemini-1.5-flash.

## Setup

bot: <https://github.com/codebam/cf-workers-telegram-bot>

d1: <https://developers.cloudflare.com/d1/get-started/>

ai gateway: <https://developers.cloudflare.com/ai-gateway/>

check wiki

## Usage

/summary 10

summarize newest 10 messages

/summary 10h


summarize newest 10h messages

/query word

can search cjk

/status

check bot is alive

## Cost

**0**

d1: telegram bot can't read info in the history, only newly sent info, so use database to keep them. [pricing](https://developers.cloudflare.com/d1/platform/pricing/#billing-metrics)

cf worker: so no more offline.(I hope so) [pricing](https://developers.cloudflare.com/workers/platform/pricing/#workers)

gemini-1.5-flash: [free for limited usage and huge context](https://ai.google.dev/pricing?hl=zh-cn#1_5flash)

---

Data will be kept for 1 month, may change in the future.

---

## TODO

add method to import group history information so history info can be searched.

maybe auto-delte query result

---

TODO:

maybe word cloud?

## Limitation

This bot will store chat history into my d1 database, so deploy your own bot is recommended. ~~Unless I am in your group~~.

Only messages sent by **user** and **after** the bot join the group can be summarized/query.

> Why doesn't my bot see messages from other bots? Bots talking to each other could potentially get stuck in unwelcome loops. To avoid this, we decided that bots will not be able to see messages from other bots regardless of mode.
>
> https://core.telegram.org/bots/faq#why-doesn-39t-my-bot-see-messages-from-other-bots

> You can't get older message than bot join.
>
> https://github.com/yagop/node-telegram-bot-api/issues/577

If you want to bypass these, check [luoxu](https://github.com/lilydjwg/luoxu), which uses userbot.
