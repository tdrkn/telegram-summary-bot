import { BotError } from "./errors";

export class TelegramClient {
	private readonly baseUrl: string;

	constructor(private readonly token: string) {
	  this.baseUrl = `https://api.telegram.org/bot${token}`;
	}

	async sendMessage(chatId: number, text: string): Promise<Response> {
	  const response = await fetch(`${this.baseUrl}/sendMessage`, {
		method: 'POST',
		headers: {
		  'Content-Type': 'application/json',
		},
		body: JSON.stringify({
		  chat_id: chatId,
		  text: text,
		}),
	  });

	  if (!response.ok) {
		throw new BotError(
		  'Failed to send Telegram message',
		  'TELEGRAM_SEND_ERROR',
		  response.status
		);
	  }

	  return response;
	}

	async getUpdates(chatId: number, limit: number): Promise<TelegramUpdate[]> {
	  const response = await fetch(
		`${this.baseUrl}/getUpdates?chat_id=${chatId}&offset=-1&limit=${limit}`
	  );

	  if (!response.ok) {
		throw new BotError(
		  'Failed to fetch Telegram updates',
		  'TELEGRAM_FETCH_ERROR',
		  response.status
		);
	  }

	  const data = await response.json();
	  // @ts-ignore
	  return data.result;
	}
  }
