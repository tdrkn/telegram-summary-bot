# telegram group summary bot (RUS)

![image_fx_](https://github.com/user-attachments/assets/d9924ced-5310-4edc-9073-bdcc1df1dd6d)

> Image by imagen-3 on ImageFX, prompt "an icon for telegram group message summarize and search message bot sketchy"

Feel scared when seeing 2000+ unread in groups? Now you can read them by LLM!

Use d1, cf worker, ai gateway, gemini-2.5-flash.

**New**: Now supports Docker deployment for local/self-hosted installations!

## NOTICE

Due to current usage exceeded maximum DB size 500M `D1_ERROR: Exceeded maximum DB size`, please deploy your own bot. And you can keep a much longer log. I have disabled this bot to be add to new group.

## Setup

### Cloudflare Workers (Original)

bot: <https://github.com/codebam/cf-workers-telegram-bot>

d1: <https://developers.cloudflare.com/d1/get-started/>

check wiki

### Docker Deployment (New)

1. **Create a Telegram Bot**:
   - Message [@BotFather](https://t.me/botfather) on Telegram
   - Run `/newbot` and follow instructions
   - Save the bot token

2. **Get Gemini API Key**:
   - Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Create a new API key
   - Save the API key

3. **Clone and Setup**:
   ```bash
   git clone https://github.com/tdrkn/telegram-summary-bot.git
   cd telegram-summary-bot
   
   # Copy environment file
   cp .env.example .env
   
   # Edit .env file with your tokens
   nano .env
   ```

4. **Configure Environment**:
   Edit `.env` file:
   ```env
   SECRET_TELEGRAM_API_TOKEN=your_telegram_bot_token_here
   GEMINI_API_KEY=your_gemini_api_key_here
   ACCOUNT_ID=local-deployment
   DATABASE_PATH=./data/messages.sqlite
   PORT=3000
   WEBHOOK_URL=https://your-domain.com/webhook
   CRON_SCHEDULE=0 0,1 * * *
   ```

5. **Deploy with Docker Compose**:
   ```bash
   # Build and start the bot
   docker-compose up -d
   
   # Check logs
   docker-compose logs -f
   
   # Stop the bot
   docker-compose down
   ```

6. **Set Webhook**:
   Replace `YOUR_BOT_TOKEN` and `YOUR_DOMAIN` with your values:
   ```bash
   curl -X POST "https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook" \
        -H "Content-Type: application/json" \
        -d '{"url": "https://YOUR_DOMAIN/webhook"}'
   ```

7. **Add Bot to Groups**:
   - Add your bot to Telegram groups
   - Give it admin permissions to read messages
   - The bot will start storing and summarizing messages

## Usage

/summary 10

summarize newest 10 messages

/summary 10h


summarize newest 10h messages

/query word

can search cjk

/ask question

answer question based on group chat

/status

check bot is alive

## Cost

**0**

d1: telegram bot can't read info in the history, only newly sent info, so use database to keep them. [pricing](https://developers.cloudflare.com/d1/platform/pricing/#billing-metrics)

cf worker: so no more offline.(I hope so) [pricing](https://developers.cloudflare.com/workers/platform/pricing/#workers)

gemini-2.5-flash: free for limited usage and huge context

---

The Newest 4000 text messages will be kept, images will be kept for 2 days. May change in the future.

---

## TODO

~~add method to import group history information so history info can be searched.~~

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
