import TelegramBot, { TelegramExecutionContext } from '@codebam/cf-workers-telegram-bot';
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
const SAFETY = [
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
const account_id = "c3986c87bee332c7e11d834c69ee0742";
const gateway_name = "telegram-summary-bot";

export default {
	async scheduled(
		controller: ScheduledController,
		env: Env,
		ctx: ExecutionContext,
	) {
		const bot = new TelegramBot(env.SECRET_TELEGRAM_API_TOKEN);
		const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
		const model = genAI.getGenerativeModel(
			{ model: "gemini-1.5-flash-8b", safetySettings: SAFETY },
			{ baseUrl: `https://gateway.ai.cloudflare.com/v1/${account_id}/${gateway_name}/google-ai-studio` }
		);
		const { results: groups } = await env.DB.prepare('SELECT DISTINCT groupId FROM Messages').all();

		for (const group of groups) {
			try {
				const { results } = await env.DB.prepare('SELECT * FROM Messages WHERE groupId=? ORDER BY timeStamp ASC LIMIT 2000')
					.bind(group.groupId)
					.all();

				if (results.length > 0) {
					const result = await model.generateContent(
						`概括下面的对话：
${results.map((r: any) => `${r.userName}: ${r.content}`).join('\n')}
          `
					);

					// Use fetch to send message directly to Telegram API
					await fetch(`https://api.telegram.org/bot${env.SECRET_TELEGRAM_API_TOKEN}/sendMessage`, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							chat_id: group.groupId,
							text: result.response.text()
						}),
					});

					// Clean up old messages
					await env.DB.prepare('DELETE FROM Messages WHERE groupId=? AND timeStamp < ?')
						.bind(group.groupId, Date.now() - 48 * 60 * 60 * 1000)
						.run();
				}
			} catch (error) {
				console.error(`Error processing group ${group.groupId}:`, error);
			}
		}

		console.log("cron processed");
	},
	fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
		const bot = new TelegramBot(env.SECRET_TELEGRAM_API_TOKEN);
		const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
		const model = genAI.getGenerativeModel(
			{ model: "gemini-1.5-flash-8b", safetySettings: SAFETY },
			{ baseUrl: `https://gateway.ai.cloudflare.com/v1/${account_id}/${gateway_name}/google-ai-studio` });

		await bot
			.on('status', async (bot: TelegramExecutionContext) => {
				await bot.reply('我家还蛮大的');
				return new Response('ok');
			})
			.on('start', async (bot: TelegramExecutionContext) => {
				switch (bot.update_type) {
					case 'message':
						await bot.reply(
							'Send me a message to talk to gemini.',
						);
						break;

					default:
						break;
				}
				return new Response('ok');
			})
			.on(':message', async (bot: TelegramExecutionContext) => {
				if (!bot.update.message?.chat.type.includes('group')) {
					await bot.reply('I am a bot, please add me to a group to use me.');
					return new Response('ok');
				}
				switch (bot.update_type) {
					case 'message': {
						const groupId = bot.update.message?.chat.id;
						const messageText = bot.update.message?.text || "";
						if (!bot.update.message?.text?.startsWith('/summary')) {
							await env.DB.prepare('INSERT INTO Messages (id, groupId, timeStamp, userName, content) VALUES (?, ?, ?, ?, ?)')
								.bind(
									crypto.randomUUID(),
									groupId,
									Date.now(),
									bot.update.message?.from?.first_name || "anonymous", // not interested in user id
									messageText
								)
								.run();
						}

						if (bot.update.message?.text?.startsWith('/summary')) {
							const { results } = await env.DB.prepare('SELECT * FROM Messages WHERE groupId=? ORDER BY timeStamp ASC LIMIT 2000')
								.bind(groupId)
								.all();
							if (results.length > 0) {
								const result = await model.generateContent(
									`概括下面的对话：:
${results.map((r: any) => `${r.userName}: ${r.content}`).join('\n')}
`
								);
								await bot.reply(result.response.text());
							}
							return new Response('ok');
						}
					};
					default:
						break;
				}
				return new Response('ok');
			})
			.handle(request.clone());
		return new Response('ok');
	},
};
