import TelegramBot, { TelegramExecutionContext } from '@codebam/cf-workers-telegram-bot';

export interface Environment {
	SECRET_TELEGRAM_API_TOKEN: string;
}

type promiseFunc<T> = (resolve: (result: T) => void, reject: (e?: Error) => void) => Promise<T>;

/**
 * Wrap setTimeout in a Promise
 * @param func - function to call after setTimeout
 */
function wrapPromise<T>(func: promiseFunc<T>, time = 1000) {
	return new Promise((resolve, reject) => {
		return setTimeout(() => {
			func(resolve, reject).catch((e: unknown) => {
				console.log(e);
			});
		}, time);
	});
}


export default {
	fetch: async (request: Request, env: Environment, ctx: ExecutionContext) => {
		const tuxrobot = new TelegramBot(env.SECRET_TELEGRAM_API_TOKEN);
		await Promise.all([
			tuxrobot
				.on('epoch', async (bot: TelegramExecutionContext) => {
					switch (bot.update_type) {
						case 'message':
							await bot.reply(Math.floor(Date.now() / 1000).toString());
							break;

						default:
							break;
					}
					return new Response('ok');
				})
				.on('start', async (bot: TelegramExecutionContext) => {
					switch (bot.update_type) {
						case 'message':
							await bot.reply(
								'Send me a message to talk to llama3. Use /clear to wipe history. Use /photo to generate a photo. Use /code to generate code.',
							);
							break;

						default:
							break;
					}
					return new Response('ok');
				})
				.on('code', async (bot: TelegramExecutionContext) => {
					switch (bot.update_type) {
						case 'message': {
							await bot.reply('```js\nconsole.log("hello world");\n```');
							break;
						}
						default:
							break;
					}
					return new Response('ok');
				})
				.on(':message', async (bot: TelegramExecutionContext) => {
					switch (bot.update_type) {
						case 'message': {
							await bot.reply(`hihihi`);
							return new Response('ok');
						};
						default:
							break;
					}
					return new Response('ok');
				})
				.handle(request.clone()),
		]);
		return new Response('ok');
	},
};
