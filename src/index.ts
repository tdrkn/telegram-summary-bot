/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { CONFIG } from "./config";
import { BotError } from "./errors";
import { GeminiClient } from "./gemini";
import { TelegramClient } from "./telegram";
import { retry, validateHours } from "./util";

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method !== 'POST') {
			return new Response('Method not allowed', { status: 405 });
		}

		try {
			const update: TelegramUpdate = await request.json();

			if (!update.message?.text?.startsWith('/summary')) {
				return new Response('OK', { status: 200 });
			}

			const chatId = update.message.chat.id;
			const params = update.message.text.split(' ');

			if (params.length !== 2) {
				throw new BotError(
					'Please use format: /summary <hours>',
					'INVALID_FORMAT'
				);
			}

			const hours = parseInt(params[1]);
			validateHours(hours);

			const telegramClient = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
			const geminiClient = new GeminiClient(env.GEMINI_API_KEY);

			// 获取历史消息
			const messages = await retry(async () => {
				const updates = await telegramClient.getUpdates(
					chatId,
					CONFIG.MAX_MESSAGES_PER_REQUEST
				);

				const endTime = Date.now();
				const startTime = endTime - (hours * 60 * 60 * 1000);

				return updates
					.filter(update => {
						const messageTime = update.message?.date ? update.message.date * 1000 : 0;
						return messageTime >= startTime && messageTime <= endTime;
					})
					.map(update => update.message?.text)
					.filter((text): text is string => !!text);
			});

			if (messages.length === 0) {
				throw new BotError(
					'No messages found in the specified time period.',
					'NO_MESSAGES'
				);
			}

			// 生成摘要
			const summary = await retry(() => geminiClient.generateSummary(messages));

			// 发送摘要
			await retry(() =>
				telegramClient.sendMessage(
					chatId,
					`Summary of the last ${hours} hours:\n\n${summary}`
				)
			);

			return new Response('OK', { status: 200 });
		} catch (error) {
			console.error('Error:', error);

			if (error instanceof BotError) {
				const update: TelegramUpdate = await request.json();
				const chatId = update.message?.chat.id;

				if (chatId) {
					const telegramClient = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
					await telegramClient.sendMessage(chatId, error.message);
				}

				return new Response(error.message, { status: error.statusCode });
			}

			return new Response('Internal server error', { status: 500 });
		}
	},

} satisfies ExportedHandler<Env>;
