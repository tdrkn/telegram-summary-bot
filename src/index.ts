import TelegramBot, { TelegramApi } from '@codebam/cf-workers-telegram-bot';
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import telegramifyMarkdown from "telegramify-markdown"
import { Buffer } from 'node:buffer';

function dispatchContent(content: string) {
	if (content.startsWith("data:image/jpeg;base64,")) {
		return {
			inlineData: {
				data: content.slice("data:image/jpeg;base64,".length),
				mimeType: "image/jpeg",
			},
		}
	}
	return content;
}

function getMessageLink(r: R) {
	return `https://t.me/c/${parseInt(r.groupId.slice(2))}/${r.messageId}`;
}

function getSendTime(r: R) {
	return new Date(r.timeStamp).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

type R = {
	groupId: string;
	userName: string;
	content: string;
	messageId: number;
	timeStamp: number;
}

function getGenModel(env: Env) {
	const model = "gemini-1.5-flash";
	const gateway_name = "telegram-summary-bot";
	const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
	const account_id = env.account_id;
	const safetySettings = [
		{
			category: HarmCategory.HARM_CATEGORY_HARASSMENT,
			threshold: HarmBlockThreshold.BLOCK_NONE,
		},
		{
			category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
			threshold: HarmBlockThreshold.BLOCK_NONE,
		},
		{
			category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
			threshold: HarmBlockThreshold.BLOCK_NONE,
		},
		{
			category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
			threshold: HarmBlockThreshold.BLOCK_NONE,
		},
	];
	return genAI.getGenerativeModel(
		{ model, safetySettings },
		{ baseUrl: `https://gateway.ai.cloudflare.com/v1/${account_id}/${gateway_name}/google-ai-studio` }
	);
}

function getCommandVar(str: string, delim: string) {
	return str.slice(str.indexOf(delim) + delim.length);
}

export default {
	async scheduled(
		controller: ScheduledController,
		env: Env,
		ctx: ExecutionContext,
	) {
		const { results: groups } = await env.DB.prepare('SELECT DISTINCT groupId FROM Messages').all();

		for (const group of groups) {
			try {
				const { results } = await env.DB.prepare('SELECT * FROM Messages WHERE groupId=? AND timeStamp >= ? ORDER BY timeStamp ASC LIMIT 2000')
					.bind(group.groupId, Date.now() - 24 * 60 * 60 * 1000)
					.all();

				if (results.length > 0) {
					const result = await getGenModel(env).generateContent([
						`用符合风格的语气概括下面的对话, 格式是 用户名: 对话内容, 发送时间. 如果对话里出现了多个主题, 请分条概括,`,
						`概括的开头是: 本日群聊总结如下：`,
						//@ts-ignore
						...results.flatMap((r: R) => [`${r.userName as string}: `, dispatchContent(r.content as string), getSendTime(r)]),
					]);
					if ([-1001687785734].includes(parseInt(group.groupId as string))) {
						// todo: use cloudflare r2 to store skip list
						continue;
					}
					const bot = new TelegramBot(env.SECRET_TELEGRAM_API_TOKEN);
					const res = await bot.currentContext.api.sendMessage(
						bot.api.toString(), {
						"chat_id": group.groupId as string,
						"parse_mode": "MarkdownV2",
						"text": telegramifyMarkdown(result.response.text(), 'keep'),
						reply_to_message_id: -1,
					}
					)
					if (!res.ok) {
						console.error(`Error sending message to group ${group.groupId}:`, JSON.stringify(await res.json()));
					}
					// Clean up old messages
					await env.DB.prepare(`
						DELETE
						FROM Messages
						WHERE groupId=? AND timeStamp < ?`)
						.bind(group.groupId, Date.now() - 30 * 24 * 60 * 60 * 1000)
						.run();
				}
			} catch (error) {
				console.error(`Error processing group ${group.groupId}:`, error);
			}
		}
		console.log("cron processed");
	},
	fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
		await new TelegramBot(env.SECRET_TELEGRAM_API_TOKEN)
			.on('status', async (ctx) => {
				const res = (await ctx.reply('我家还蛮大的'))!;
				if (!res.ok) {
					console.error(`Error sending message:`, JSON.stringify(await res.json()));
				}
				return new Response('ok');
			})
			.on("query", async (ctx) => {
				const groupId = ctx.update.message!.chat.id;
				const messageText = ctx.update.message!.text || "";
				if (!messageText.split(" ")[1]) {
					const res = (await ctx.reply('请输入要查询的关键词'))!;
					if (!res.ok) {
						console.error(`Error sending message:`, JSON.stringify(await res.json()));
					}
					return new Response('ok');
				}
				const { results } = await env.DB.prepare(`
					SELECT * FROM Messages
					WHERE groupId=? AND content GLOB ?
					ORDER BY timeStamp ASC
					LIMIT 2000`)
					.bind(groupId, `*${messageText.split(" ")[1]}*`)
					.all();
				const res = (await ctx.reply(`查询结果:
${results.map((r: any) => `${r.userName}: ${r.content} ${r.messageId == null ? "" : `[link](https://t.me/c/${parseInt(r.groupId.slice(2))}/${r.messageId})`}`).join('\n')}`, "MarkdownV2"))!;
				if (!res.ok) {
					console.error(`Error sending message:`, JSON.stringify(await res.json()));
				}
				return new Response('ok');
			})
			.on("ask", async (ctx) => {
				const groupId = ctx.update.message!.chat.id;
				const userId = ctx.update.message!.from!.id;
				const messageText = ctx.update.message!.text || "";
				if (!messageText.split(" ")[1]) {
					const res = (await ctx.reply('请输入要问的问题'))!;
					if (!res.ok) {
						console.error(`Error sending message:`, JSON.stringify(await res.json()));
					}
					return new Response('ok');
				}
				const { results } = await env.DB.prepare(`
					SELECT * FROM Messages
					WHERE groupId=?
					ORDER BY timeStamp ASC
					LIMIT 1000`)
					.bind(groupId)
					.all();
				const result = await getGenModel(env).generateContent([
					`下面是一系列的对话, 格式是 用户名: 对话内容, 消息链接, 发送时间`,
					//@ts-ignore
					...results.flatMap((r: R) => [`${r.userName as string}: `, dispatchContent(r.content as string), getMessageLink(r), getSendTime(r)]),
					`基于上面的记录, 用符合上文风格的语气回答这个问题, 并在回答的关键词中用 markdown 的格式引用原对话的链接`,
					getCommandVar(messageText, " "),
				]);
				let response_text: string;
				if (result.response.promptFeedback?.blockReason) {
					response_text = "无法回答, 理由" + result.response.promptFeedback.blockReason;
				}
				else {
					response_text = telegramifyMarkdown(result.response.text(), 'keep');
				}
				let res = await ctx.api.sendMessage(ctx.bot.api.toString(), {
					"chat_id": userId,
					"parse_mode": "MarkdownV2",
					"text": response_text,
					reply_to_message_id: -1,
				});
				if (!res.ok) {
					await ctx.reply(`请开启和 bot 的私聊, 不然无法接收消息`);
				}
				return new Response('ok');
			})
			.on("summary", async (bot) => {
				const groupId = bot.update.message!.chat.id;
				if (bot.update.message!.text!.split(" ").length === 1) {
					await bot.reply('请输入要查询的时间范围/消息数量, 如 /summary 114h 或 /summary 514');
					return new Response('ok');
				}
				const summary = bot.update.message!.text!.split(" ")[1];
				let results: Record<string, unknown>[];
				try {
					const test = parseInt(summary);
					if (Number.isNaN(test)) {
						throw new Error("not a number");
					}
					if (test < 0) {
						throw new Error("negative number");
					}
					if (!Number.isFinite(test)) {
						throw new Error("infinite number");
					}
				}
				catch (e: any) {
					await bot.reply('请输入要查询的时间范围/消息数量, 如 /summary 114h 或 /summary 514  ' + e.message);
					return new Response('ok');
				}
				if (summary.endsWith("h")) {
					results = (await env.DB.prepare(`
						SELECT *
						FROM Messages
						WHERE groupId=? AND timeStamp >= ?
						ORDER BY timeStamp ASC
						LIMIT 2000`)
						.bind(groupId, Date.now() - parseInt(summary) * 60 * 60 * 1000)
						.all()).results;
				}
				else {
					results = (await env.DB.prepare(`
						SELECT * FROM Messages
						WHERE groupId=?
						ORDER BY timeStamp DESC
						LIMIT ?`)
						.bind(groupId, parseInt(summary))
						.all()).results;
				}
				if (results.length > 0) {
					const result = await getGenModel(env).generateContent(
						[
							`用符合风格的语气概括下面的对话, 对话格式为 用户名: 发言内容, 相应链接, 如果对话里出现了多个主题, 请分条概括, 涉及到的图片也要提到相关内容, 并在回答的关键词中用 markdown 的格式引用原对话的链接`,
							`群聊总结如下:`,
							...results.flatMap((r: any) => [`${r.userName}:`, ` ${dispatchContent(r.content)}`, getMessageLink(r)]),
						]
					);
					await bot.reply(telegramifyMarkdown(result.response.text(), 'keep'), 'MarkdownV2');
				}
				return new Response('ok');
			})
			.on(':message', async (bot) => {
				if (!bot.update.message!.chat.type.includes('group')) {
					await bot.reply('I am a bot, please add me to a group to use me.');
					return new Response('ok');
				}
				function getUserName(msg: any) {
					if (msg.from?.username === "Channel_Bot" && msg.from?.is_bot) {
						return msg.sender_chat.title as string;
					}
					return msg.from?.first_name as string || "anonymous";
				}
				switch (bot.update_type) {
					case 'message': {
						const msg = bot.update.message!;
						const groupId = msg.chat.id;
						const content = msg.text || "";
						const messageId = msg.message_id;
						const groupName = msg.chat.title || "anonymous";
						const timeStamp = Date.now();
						const userName = getUserName(msg);
						await env.DB.prepare(`
							INSERT INTO Messages(id, groupId, timeStamp, userName, content, messageId, groupName) VALUES (?, ?, ?, ?, ?, ?, ?)`)
							.bind(
								crypto.randomUUID(),
								groupId,
								timeStamp,
								userName, // not interested in user id
								content,
								messageId,
								groupName
							)
							.run();
						return new Response('ok');

					}
					case "photo": {
						const msg = bot.update.message!;
						const groupId = msg.chat.id;
						const messageId = msg.message_id;
						const groupName = msg.chat.title || "anonymous";
						const timeStamp = Date.now();
						const userName = getUserName(msg);
						const photo = msg.photo![msg.photo!.length - 1];
						const file = await bot.getFile(photo.file_id).then((response) => response.arrayBuffer());

						await env.DB.prepare(`
							INSERT INTO Messages(id, groupId, timeStamp, userName, content, messageId, groupName) VALUES (?, ?, ?, ?, ?, ?, ?)`)
							.bind(
								crypto.randomUUID(),
								groupId,
								timeStamp,
								userName, // not interested in user id
								"data:image/jpeg;base64," + Buffer.from(file).toString("base64"),
								messageId,
								groupName
							)
							.run();
						return new Response('ok');
					}
				}
				return new Response('ok');
			})
			.handle(request.clone());
		return new Response('ok');
	},
};
