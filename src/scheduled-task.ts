import { getGenModel, SYSTEM_PROMPTS, dispatchContent, getMessageLink, processMarkdownLinks, messageTemplate, fixLink, escapeMarkdownV2, model, temperature } from './index';
import telegramifyMarkdown from "telegramify-markdown";

interface Env {
  SECRET_TELEGRAM_API_TOKEN: string;
  GEMINI_API_KEY: string;
  account_id: string;
  DB: any;
}

interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
}

export async function scheduledTask(env: Env, ctx: ExecutionContext) {
  console.debug("Scheduled task starting:", new Date().toISOString());
  const date = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  
  // Clean up oldest 4000 messages
  if (date.getHours() === 0 && date.getMinutes() < 5) {
    await env.DB.prepare(`
      DELETE FROM Messages
      WHERE id IN (
        SELECT id
        FROM (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY groupId
              ORDER BY timeStamp DESC
            ) as row_num
          FROM Messages
        ) ranked
        WHERE row_num > 3000
      );`)
      .run();
  }

  // Instead of Cloudflare cache, we'll use a simple in-memory cache for groups
  // This is a simplified version - in production you might want to use Redis
  const { results: groups } = await env.DB.prepare('SELECT DISTINCT groupId FROM Messages WHERE timeStamp >= ?')
    .bind(Date.now() - 24 * 60 * 60 * 1000)
    .all();

  // Process batches (using modulo of current minute for batch selection)
  const batch = date.getMinutes() % 10;
  console.debug("Batch:", batch);
  console.debug("Found groups:", groups.length, JSON.stringify(groups));

  for (const [id, group] of groups.entries()) {
    if (id % 10 !== batch) {
      continue;
    }
    console.debug(`Processing group ${id + 1}/${groups.length}: ${group.groupId}`);
    const { results } = await env.DB.prepare('SELECT * FROM Messages WHERE groupId=? AND timeStamp >= ? ORDER BY timeStamp ASC')
      .bind(group.groupId, Date.now() - 24 * 60 * 60 * 1000)
      .all()

    const result = await getGenModel(env).chat.completions.create({
      model,
      messages: [
        {
          "role": "system",
          content: SYSTEM_PROMPTS.summarizeChat,
        },
        {
          "role": "user",
          content: results.flatMap(
            (r: any) => [
              dispatchContent(`====================`),
              dispatchContent(`${r.userName}:`),
              dispatchContent(r.content),
              dispatchContent(getMessageLink(r)),
            ]
          )
        }
      ],
      max_tokens: 4096,
      temperature
    });

    let response_text: string;
    response_text = processMarkdownLinks(telegramifyMarkdown(result.choices[0].message.content || "", 'keep'));
    response_text = messageTemplate(response_text);
    response_text = fixLink(response_text);

    const res = await fetch(`https://api.telegram.org/bot${env.SECRET_TELEGRAM_API_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: group.groupId,
        text: response_text,
        parse_mode: "MarkdownV2",
      }),
    });
    if (!res?.ok) {
      console.error("Failed to send reply", res?.statusText, await res?.text());
    }
  }

  // Clean up old images
  if (date.getHours() === 0 && date.getMinutes() < 5) {
    ctx.waitUntil(env.DB.prepare(`
      DELETE
      FROM Messages
      WHERE timeStamp < ? AND content LIKE 'data:image/jpeg;base64,%'`)
      .bind(Date.now() - 24 * 60 * 60 * 1000)
      .run());
  }
  console.debug("cron processed");
}