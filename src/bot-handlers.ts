import TelegramBot from '@codebam/cf-workers-telegram-bot';
import OpenAI from "openai";
import telegramifyMarkdown from "telegramify-markdown";
//@ts-ignore
import { Buffer } from 'node:buffer';
import { isJPEGBase64 } from './isJpeg';
import { extractAllOGInfo } from "./og";

// Import types and functions from original index.ts
import { 
  dispatchContent, 
  getMessageLink, 
  getSendTime, 
  escapeMarkdownV2, 
  toSuperscript, 
  processMarkdownLinks, 
  getGenModel, 
  foldText, 
  SYSTEM_PROMPTS, 
  getCommandVar, 
  messageTemplate, 
  fixLink, 
  getUserName,
  model,
  temperature
} from './index';

interface Env {
  SECRET_TELEGRAM_API_TOKEN: string;
  GEMINI_API_KEY: string;
  account_id: string;
  DB: any;
}

interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException?(): void;
}

export async function botHandlers(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  return await new TelegramBot(env.SECRET_TELEGRAM_API_TOKEN)
    .on('status', async (ctx) => {
      const res = (await ctx.reply('Мой дом довольно большой'))!;
      if (!res.ok) {
        console.error(`Error sending message:`, res);
      }
      return new Response('ok');
    })
    .on("query", async (ctx) => {
      const groupId = ctx.update.message!.chat.id;
      const messageText = ctx.update.message!.text || "";
      if (!messageText.split(" ")[1]) {
        const res = (await ctx.reply('Пожалуйста, введите ключевое слово для поиска'))!;
        if (!res.ok) {
          console.error(`Error sending message:`, res);
        }
        return new Response('ok');
      }
      const { results } = await env.DB.prepare(`
        SELECT * FROM Messages
        WHERE groupId=? AND content GLOB ?
        ORDER BY timeStamp DESC
        LIMIT 2000`)
        .bind(groupId, `*${messageText.split(" ")[1]}*`)
        .all();
      const res = (await ctx.reply(
        escapeMarkdownV2(`Результаты поиска:
${results.map((r: any) => `${r.userName}: ${r.content} ${r.messageId == null ? "" : `[link](https://t.me/c/${parseInt(r.groupId.slice(2))}/${r.messageId})`}`).join('\n')}`), "MarkdownV2"))!;
      if (!res.ok) {
        console.error(`Error sending message:`, res.status, res.statusText, await res.text());
      }
      return new Response('ok');
    })
    .on("ask", async (ctx) => {
      const groupId = ctx.update.message!.chat.id;
      const userId = ctx.update.message!.from!.id;
      const messageText = ctx.update.message!.text || "";
      if (!messageText.split(" ")[1]) {
        const res = (await ctx.reply('Пожалуйста, введите вопрос'))!;
        if (!res.ok) {
          console.error(`Error sending message:`, res);
        }
        return new Response('ok');
      }
      let res = await ctx.api.sendMessage(ctx.bot.api.toString(), {
        "chat_id": userId,
        "parse_mode": "MarkdownV2",
        "text": "Бот получил ваш вопрос, пожалуйста, подождите",
        reply_to_message_id: -1,
      });
      if (!res.ok) {
        await ctx.reply(`Пожалуйста, включите приватный чат с ботом, иначе вы не сможете получать сообщения`);
        return new Response('ok');
      }
      const { results } = await env.DB.prepare(`
        WITH latest_1000 AS (
          SELECT * FROM Messages
          WHERE groupId=?
          ORDER BY timeStamp DESC
          LIMIT 1000
        )
        SELECT * FROM latest_1000
        ORDER BY timeStamp ASC
        `)
        .bind(groupId)
        .all();
      let result;
      try {
        result = await getGenModel(env)
          .chat.completions.create({
            model,
            messages: [
              {
                "role": "system",
                content: SYSTEM_PROMPTS.answerQuestion,
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
              },
              {
                "role": "user",
                content: `Вопрос: ${getCommandVar(messageText, " ")}`
              }
            ],
            max_tokens: 4096,
            temperature
          });
      } catch (e) {
        console.error(e);
        return new Response('ok');
      }
      let response_text: string;
      response_text = processMarkdownLinks(telegramifyMarkdown(result.choices[0].message.content || "", 'keep'));

      res = await ctx.api.sendMessage(ctx.bot.api.toString(), {
        "chat_id": userId,
        "parse_mode": "MarkdownV2",
        "text": foldText(response_text),
        reply_to_message_id: -1,
      });
      if (!res.ok) {
        let reason = (await res.json() as any)?.promptFeedback?.blockReason;
        if (reason) {
          await ctx.reply(`Невозможно ответить, причина: ${reason}`);
          return new Response('ok');
        }
        await ctx.reply(`Ошибка отправки`);
      }
      return new Response('ok');
    })
    .on("summary", async (bot) => {
      const groupId = bot.update.message!.chat.id;
      if (bot.update.message!.text!.split(" ").length === 1) {
        await bot.reply('Пожалуйста, введите временной диапазон/количество сообщений для запроса, например /summary 114h или /summary 514');
        return new Response('ok');
      }
      const summary = bot.update.message!.text!.split(" ")[1];
      let results: Record<string, unknown>[];
      try {
        const test = parseInt(summary);
        if (Number.isNaN(test)) {
          throw new Error("not a number");
        }
        const { results: r } = await env.DB.prepare('SELECT * FROM Messages WHERE groupId=? ORDER BY timeStamp DESC LIMIT ?')
          .bind(groupId, test)
          .all();
        results = r;
      } catch {
        if (summary.endsWith("h")) {
          const hours = parseInt(summary.slice(0, -1));
          if (Number.isNaN(hours)) {
            await bot.reply('Неправильный формат времени');
            return new Response('ok');
          }
          const { results: r } = await env.DB.prepare('SELECT * FROM Messages WHERE groupId=? AND timeStamp >= ? ORDER BY timeStamp ASC')
            .bind(groupId, Date.now() - hours * 60 * 60 * 1000)
            .all();
          results = r;
        } else {
          await bot.reply('Неправильный формат');
          return new Response('ok');
        }
      }

      if (results.length === 0) {
        await bot.reply('Сообщения не найдены');
        return new Response('ok');
      }

      let result;
      try {
        result = await getGenModel(env).chat.completions.create({
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
      } catch (e) {
        console.error(e);
        await bot.reply(`Ошибка генерации резюме`);
        return new Response('ok');
      }

      let response_text: string;
      response_text = processMarkdownLinks(telegramifyMarkdown(result.choices[0].message.content || "", 'keep'));
      response_text = messageTemplate(response_text);
      response_text = fixLink(response_text);
      console.debug("Response:", response_text);

      const res = await bot.reply(response_text, "MarkdownV2");
      if (res && !res.ok) {
        let reason = (await res.json() as any)?.promptFeedback?.blockReason;
        if (reason) {
          await bot.reply(`Невозможно создать резюме, причина: ${reason}`);
          return new Response('ok');
        }
        await bot.reply(`Ошибка отправки резюме`);
      }
      return new Response('ok');
    })
    .on('text', async (bot) => {
      const msg = bot.update.message!;
      const groupId = msg.chat.id;
      let content = msg.text || "";
      const fwd = msg.forward_from?.last_name;
      const replyTo = msg.reply_to_message?.message_id;
      if (fwd) {
        content = `Переслано от ${fwd}: ${content}`;
      }
      if (replyTo) {
        content = `Ответ на ${getMessageLink({ groupId: groupId.toString(), messageId: replyTo })}: ${content}`;
      }
      if (content.startsWith("http") && !content.includes(" ")) {
        content = await extractAllOGInfo(content);
      }
      const messageId = msg.message_id;
      const groupName = msg.chat.title || "anonymous";
      const timeStamp = Date.now();
      const userName = getUserName(msg);
      try {
        await env.DB.prepare(`
          INSERT INTO Messages(id, groupId, timeStamp, userName, content, messageId, groupName) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            getMessageLink({ groupId: groupId.toString(), messageId }),
            groupId,
            timeStamp,
            userName, // not interested in user id
            content,
            messageId,
            groupName
          )
          .run();
      }
      catch (e) {
        console.error(e);
      }
      return new Response('ok');

    })
    .on("photo", async (bot) => {
      const msg = bot.update.message!;
      const groupId = msg.chat.id;
      const messageId = msg.message_id;
      const groupName = msg.chat.title || "anonymous";
      const timeStamp = Date.now();
      const userName = getUserName(msg);
      const caption = msg.caption || "";
      const photos = msg.photo!;
      const largestPhoto = photos[photos.length - 1];
      const fileId = largestPhoto.file_id;

      try {
        const fileResponse = await fetch(`https://api.telegram.org/bot${env.SECRET_TELEGRAM_API_TOKEN}/getFile?file_id=${fileId}`);
        const fileData = await fileResponse.json() as any;
        if (!fileData.ok) {
          console.error("Failed to get file info", fileData);
          return new Response('ok');
        }

        const filePath = fileData.result.file_path;
        const fileUrl = `https://api.telegram.org/file/bot${env.SECRET_TELEGRAM_API_TOKEN}/${filePath}`;

        const imageResponse = await fetch(fileUrl);
        if (!imageResponse.ok) {
          console.error("Failed to download image", imageResponse.statusText);
          return new Response('ok');
        }

        const imageBuffer = await imageResponse.arrayBuffer();
        const base64Image = Buffer.from(imageBuffer).toString('base64');
        if (!isJPEGBase64(base64Image)) {
          console.error("Image is not JPEG format");
          return new Response('ok');
        }

        const content = `data:image/jpeg;base64,${base64Image}`;

        await env.DB.prepare(`
          INSERT INTO Messages(id, groupId, timeStamp, userName, content, messageId, groupName) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            getMessageLink({ groupId: groupId.toString(), messageId }),
            groupId,
            timeStamp,
            userName,
            content,
            messageId,
            groupName
          )
          .run();

        // Also store caption if present
        if (caption) {
          await env.DB.prepare(`
            INSERT INTO Messages(id, groupId, timeStamp, userName, content, messageId, groupName) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .bind(
              getMessageLink({ groupId: groupId.toString(), messageId }) + "_caption",
              groupId,
              timeStamp,
              userName,
              `Подпись к изображению: ${caption}`,
              messageId,
              groupName
            )
            .run();
        }
      } catch (e) {
        console.error("Error processing photo:", e);
      }
      return new Response('ok');
    })
    .handle(request);
}