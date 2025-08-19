import TelegramBot, { TelegramApi } from '@codebam/cf-workers-telegram-bot';
import OpenAI from "openai";

import telegramifyMarkdown from "telegramify-markdown"
//@ts-ignore
import { Buffer } from 'node:buffer';
import { isJPEGBase64 } from './isJpeg';
import { extractAllOGInfo } from "./og"
function dispatchContent(content: string): { type: "text", text: string } | { type: "image_url", image_url: { url: string } } {
	if (content.startsWith("data:image/jpeg;base64,")) {
		return ({
			"type": "image_url",
			"image_url": {
				"url": content
			},
		})
	}
	return ({
		"type": "text",
		"text": content,
	});
}

function getMessageLink(r: { groupId: string, messageId: number }) {
	return `https://t.me/c/${parseInt(r.groupId.slice(2))}/${r.messageId}`;
}

function getSendTime(r: R) {
	return new Date(r.timeStamp).toLocaleString("ru-RU", { timeZone: "Asia/Shanghai" });
}

function escapeMarkdownV2(text: string) {
	// Примечание: обратный слеш \ сам по себе тоже нужно экранировать, поэтому в регулярном выражении \\\\
	// или использовать непосредственно \ в строке
	const reservedChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
	// Регулярное выражение требует экранирования специальных символов
	const escapedChars = reservedChars.map(char => '\\' + char).join('');
	const regex = new RegExp(`([${escapedChars}])`, 'g');
	return text.replace(regex, '\\$1');
}

/**
 * Преобразование числа в верхний индекс
 * @param {number} num - число для преобразования
 * @returns {string} число в виде верхнего индекса
 */
export function toSuperscript(num: number) {
	const superscripts = {
		'0': '⁰',
		'1': '¹',
		'2': '²',
		'3': '³',
		'4': '⁴',
		'5': '⁵',
		'6': '⁶',
		'7': '⁷',
		'8': '⁸',
		'9': '⁹'
	};

	return num
		.toString()
		.split('')
		.map(digit => superscripts[digit as keyof typeof superscripts])
		.join('');
}
/**
 * Обработка повторяющихся ссылок в Markdown тексте, преобразование их в последовательно пронумерованный формат
 * @param {string} text - входной Markdown текст
 * @param {Object} options - параметры конфигурации
 * @param {string} options.prefix - префикс для текста ссылки, по умолчанию "ссылка"
 * @param {boolean} options.useEnglish - использовать ли английский (link1) вместо русского (ссылка1), по умолчанию false
 * @returns {string} обработанный Markdown текст
 */
export function processMarkdownLinks(text: string, options: { prefix: string, useEnglish: boolean } = {
	prefix: 'ссылка',
	useEnglish: false
}) {
	const {
		prefix,
		useEnglish
	} = options;

	// используется для хранения уже встречавшихся ссылок
	const linkMap = new Map();
	let linkCounter = 1;

	// регулярное выражение для поиска markdown ссылок
	const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;

	return text.replace(linkPattern, (match, displayText, url) => {
		// обрабатывать только случаи, когда отображаемый текст и URL полностью совпадают
		if (displayText !== url) {
			return match; // оставить как есть
		}

		// если этот URL уже встречался, использовать существующий номер
		if (!linkMap.has(url)) {
			linkMap.set(url, linkCounter++);
		}

		const number = linkMap.get(url);
		const superscriptNumber = toSuperscript(number);
		const linkText = useEnglish ? `link${superscriptNumber}` : `${prefix}${superscriptNumber}`;

		return `[${linkText}](${url})`;
	});
}

function foldText(text: string) {
	const maxLength = 4096; // Максимальная длина сообщения в Telegram

	if (text.length <= maxLength) {
		return text;
	}

	// Если текст слишком длинный, обрезать его и добавить указание о том, что он был обрезан
	const truncatedText = text.substring(0, maxLength - 50); // Оставить место для сообщения об обрезке
	return truncatedText + '... (текст был обрезан из-за ограничения длины)';
}

type R = {
	id: string;
	groupId: string;
	userName: string;
	content: string;
	groupName: string;
	messageId: number;
	timeStamp: number;
}
const model = "gemini-2.0-flash";
const reasoning_effort = "none";
const temperature = 0.4;
function getGenModel(env: Env) {
	const openai = new OpenAI({
		apiKey: env.GEMINI_API_KEY,
		baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
		timeout: 999999999999,
	});
	const account_id = env.account_id;
	return openai;
}

const SYSTEM_PROMPTS = {
	summarizeChat: `Вы - умный помощник группового чата. Ваша задача - создавать краткую и понятную сводку групповых разговоров.

Записи группового чата будут предоставлены в следующем формате:
====================
Имя пользователя:
Сообщение
Соответствующая ссылка
====================

Пожалуйста, следуйте этим рекомендациям:
1. Если разговор содержит несколько тем, резюмируйте их по пунктам
2. Если в разговоре упоминаются изображения, включите описание соответствующего содержания в резюме
3. В ответе используйте markdown формат для ссылок на оригинальные диалоги
4. Формат ссылок должен быть: [ссылка1](тело ссылки), [ключевое слово1](тело ссылки) и т.д.
5. Резюме должно быть кратким и ясным, захватывая основное содержание и настроение разговора
6. Начинайте резюме с "Сводка группового чата на сегодня:"`,

	answerQuestion: `Вы - умный помощник группового чата. Ваша задача - отвечать на вопросы пользователей на основе предоставленных записей группового чата.
Записи группового чата будут предоставлены в следующем формате:
====================
Имя пользователя:
Сообщение
Соответствующая ссылка
====================

Пожалуйста, следуйте этим рекомендациям:
1. Отвечайте в тоне, соответствующем стилю группового чата
2. В ответе ссылайтесь на соответствующие оригинальные сообщения в качестве основания
3. Используйте markdown формат для ссылок на оригинальные диалоги: [ссылка1](тело ссылки), [ключевое слово1](тело ссылки)
4. Добавляйте пробелы по обеим сторонам ссылок
5. Если соответствующая информация не найдена, честно сообщите об этом
6. Ответ должен быть кратким, но полным по содержанию`
};

function getCommandVar(str: string, delim: string) {
	return str.slice(str.indexOf(delim) + delim.length);
}

function messageTemplate(s: string) {
	return `Ниже представлена сводка от бесплатного ${escapeMarkdownV2(model)}\n` + s + `\n[Адрес открытого проекта](https://github\\.com/asukaminato0721/telegram-summary-bot)`;
}
/**
 * 
 * @param text 
 * @description I dont know why, but llm keep output tme.cat, so we need to fix it
 * @returns 
 */
function fixLink(text: string) {
	return text.replace(/tme\.cat/g, "t.me/c").replace(/\/c\/c/g, "/c");
}
function getUserName(msg: any) {
	if (msg?.sender_chat?.title) {
		return msg.sender_chat.title as string;
	}
	return msg.from?.first_name as string || "anonymous";
}

// Function to safely extract message object from different update types
function pickMsg(update: any) {
	// только сообщения, где потенциально есть команда/текст
	const msg =
		update.message ??
		update.edited_message ??
		update.channel_post ??
		update.edited_channel_post ??
		update.callback_query?.message ??
		null;
	return msg;
}

// Function to send message to Telegram
async function sendMessage(env: Env, chatId: number, text: string, parseMode: string = "MarkdownV2") {
	const response = await fetch(`https://api.telegram.org/bot${env.SECRET_TELEGRAM_API_TOKEN}/sendMessage`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			chat_id: chatId,
			text: text,
			parse_mode: parseMode,
		}),
	});
	return response;
}

export default {
	async scheduled(
		controller: ScheduledController,
		env: Env,
		ctx: ExecutionContext,
	) {
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
		const cache = caches.default;
		const cacheKey = new Request(`https://dummy-url/${env.SECRET_TELEGRAM_API_TOKEN}`);
		const cachedResponse = await cache.match(cacheKey);
		let groups: any[] = [];
		if (cachedResponse) {
			console.debug("Using cached response");
			groups = await cachedResponse.json();
		}
		else {
			console.debug("Fetching groups");
			groups = (await env.DB.prepare(`
		WITH MessageCounts AS (
			SELECT
				groupId,
				COUNT(*) as message_count
			FROM Messages
			WHERE timeStamp >= ?1 - (24 * 3600 * 1000)
			GROUP BY groupId
		)
		SELECT groupId, message_count
		FROM MessageCounts
		WHERE message_count > 10
		ORDER BY message_count DESC;
		`).bind(Date.now()).all()).results;
			ctx.waitUntil(
				cache.put(cacheKey, new Response(JSON.stringify(groups), {
					headers: {
						'content-type': 'application/json',
						"Cache-Control": "s-maxage=10000", // > 7200 < 86400
					},
				})));
		}
		const batch = Math.floor(date.getMinutes() / 6);  // 0 <= batch < 10

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
					}],
				max_tokens: 4096,
				temperature
			})
			if ([-1001687785734].includes(parseInt(group.groupId as string))) {
				// todo: use cloudflare r2 to store skip list
				continue;
			}
			console.debug("send message to", group.groupId);

			// Use fetch to send message directly to Telegram API
			const res = await fetch(`https://api.telegram.org/bot${env.SECRET_TELEGRAM_API_TOKEN}/sendMessage`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					chat_id: group.groupId,
					text: messageTemplate(foldText(
						fixLink(
							processMarkdownLinks(telegramifyMarkdown(result.choices[0].message.content || "", 'keep'))))),
					parse_mode: "MarkdownV2",
				}),
			});
			if (!res?.ok) {
				console.error("Failed to send reply", res?.statusText, await res?.text());
			}
		}
		// clean up old images
		if (date.getHours() === 0 && date.getMinutes() < 5) {
			ctx.waitUntil(env.DB.prepare(`
					DELETE
					FROM Messages
					WHERE timeStamp < ? AND content LIKE 'data:image/jpeg;base64,%'`)
				.bind(Date.now() - 24 * 60 * 60 * 1000)
				.run());
		}
		console.debug("cron processed");
	},
	fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
		try {
			const url = new URL(request.url);
			// простая проверка токена в пути, если используется
			const tokenInPath = url.pathname.slice(1);
			if (tokenInPath !== env.SECRET_TELEGRAM_API_TOKEN) {
				return new Response("unauthorized", { status: 401 });
			}

			const update = await request.json().catch(() => ({}));
			console.log(update); // оставить на время дебага

			// нормализуем
			const msg = pickMsg(update);

			// Сервисные апдейты типа my_chat_member / chat_member / chat_join_request — игнорим
			if (!msg || !msg.chat) {
				return new Response("ignored", { status: 200 });
			}

			const chatId = msg.chat.id;
			const text: string | undefined = msg.text;

			// без текста — игнор
			if (!text || typeof text !== "string") {
				return new Response("ok", { status: 200 });
			}

			// простейший разбор команд
			if (text.startsWith("/status")) {
				await sendMessage(env, chatId, "✅ Бот жив. Запускается саммари по командам.");
				return new Response("ok", { status: 200 });
			}

			if (text.startsWith("/summary")) {
				// извлечь N, по умолч. 20
				const parts = text.split(/\s+/);
				const param = parts[1] || "20";
				let results: Record<string, unknown>[];
				
				try {
					let n: number;
					let isHours = false;
					
					if (param.endsWith("h")) {
						n = parseInt(param.slice(0, -1));
						isHours = true;
					} else {
						n = parseInt(param);
					}
					
					if (isNaN(n) || n <= 0 || !Number.isFinite(n)) {
						await sendMessage(env, chatId, "Пожалуйста, введите корректное число сообщений или часов, например /summary 20 или /summary 12h");
						return new Response("ok", { status: 200 });
					}
					
					if (isHours) {
						// Поиск по времени (часы)
						results = (await env.DB.prepare(`
							SELECT * FROM Messages
							WHERE groupId=? AND timeStamp >= ?
							ORDER BY timeStamp ASC
						`).bind(chatId, Date.now() - n * 60 * 60 * 1000).all()).results;
					} else {
						// Поиск по количеству сообщений
						n = Math.max(1, Math.min(4000, n));
						results = (await env.DB.prepare(`
							WITH latest_n AS (
								SELECT * FROM Messages
								WHERE groupId=?
								ORDER BY timeStamp DESC
								LIMIT ?
							)
							SELECT * FROM latest_n
							ORDER BY timeStamp ASC
						`).bind(chatId, n).all()).results;
					}
					
					if (results.length > 0) {
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
						
						const summaryText = messageTemplate(foldText(
							fixLink(
								processMarkdownLinks(telegramifyMarkdown(result.choices[0].message.content || "", 'keep')))));
						await sendMessage(env, chatId, summaryText);
					} else {
						await sendMessage(env, chatId, "Не найдено сообщений для создания сводки.");
					}
				} catch (e) {
					console.error(e);
					await sendMessage(env, chatId, "Произошла ошибка при создании сводки.");
				}
				return new Response("ok", { status: 200 });
			}

			// Если не команда, сохраняем сообщение в БД (если это группа)
			if (msg.chat.type && msg.chat.type.includes('group')) {
				const groupId = msg.chat.id;
				const messageId = msg.message_id;
				const groupName = msg.chat.title || "anonymous";
				const timeStamp = Date.now();
				const userName = getUserName(msg);
				let content = text;

				// Обработка переслания
				const fwd = msg.forward_from?.last_name;
				const replyTo = msg.reply_to_message?.message_id;
				if (fwd) {
					content = `Переслано от ${fwd}: ${content}`;
				}
				if (replyTo) {
					content = `Ответ на ${getMessageLink({ groupId: groupId.toString(), messageId: replyTo })}: ${content}`;
				}
				
				// Обработка ссылок
				if (content.startsWith("http") && !content.includes(" ")) {
					content = await extractAllOGInfo(content);
				}

				try {
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
				} catch (e) {
					console.error(e);
				}
			} else {
				// Приватный чат - отправляем инструкцию
				await sendMessage(env, chatId, "Я бот, пожалуйста, добавьте меня в группу, чтобы использовать.", "");
			}

			return new Response("ok", { status: 200 });
		} catch (err: any) {
			console.error(err);
			// всегда 200, чтобы не плодить 500 в Telegram
			return new Response("ok", { status: 200 });
		}
	},
};