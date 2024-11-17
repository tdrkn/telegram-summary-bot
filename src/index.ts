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
export default {
	fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
		const bot = new TelegramBot(env.SECRET_TELEGRAM_API_TOKEN);
		const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
		const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-8b", safetySettings: SAFETY });

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
							await env.DB.prepare('INSERT INTO Messages (id, groupId, timeStamp, content) VALUES (?, ?, ?, ?)')
								.bind(
									crypto.randomUUID(),
									groupId,
									Date.now(),
									messageText
								)
								.run();
						}

						if (bot.update.message?.text?.startsWith('/summary')) {
							const { results } = await env.DB.prepare('SELECT * FROM Messages WHERE groupId=? ORDER BY timeStamp ASC LIMIT 400')
								.bind(groupId)
								.all();
							const result = await model.generateContent(
								`summarize following text:
${results.map((r: any) => r.content).join('\n')}
`
							);
							await bot.reply(result.response.text());
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
