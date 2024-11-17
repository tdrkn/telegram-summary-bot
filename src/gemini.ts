import { GoogleGenerativeAI, GenerativeModel, GenerationConfig, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { BotError } from './errors';
import { CONFIG } from './config';

export class GeminiClient {
	private readonly model: GenerativeModel;
	private readonly generationConfig: GenerationConfig = {
		temperature: 0.7,
		topK: 40,
		topP: 0.95,
		maxOutputTokens: 8192,
	};

	constructor(apiKey: string) {
		const genAI = new GoogleGenerativeAI(apiKey);
		this.model = genAI.getGenerativeModel({
			model: "gemini-1.5-flash",
			generationConfig: this.generationConfig
		});
	}

	async generateSummary(messages: string[]): Promise<string> {
		try {
			const prompt = this.createPrompt(messages);

			const result = await this.model.generateContent({
				contents: [{ role: 'user', parts: [{ text: prompt }] }],
				safetySettings: [
					{
						category:
							HarmCategory.HARM_CATEGORY_HARASSMENT,
						threshold: HarmBlockThreshold.BLOCK_NONE
					},
					{
						category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
						threshold: HarmBlockThreshold.BLOCK_NONE
					},
					{
						category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
						threshold: HarmBlockThreshold.BLOCK_NONE
					},
					{
						category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
						threshold: HarmBlockThreshold.BLOCK_NONE
					}
				]
			});

			const response = result.response;
			const text = response.text();

			if (!text) {
				throw new Error('Empty response from Gemini API');
			}

			return text;
		} catch (error) {
			if (error instanceof Error) {
				throw new BotError(
					`Failed to generate summary: ${error.message}`,
					'GEMINI_API_ERROR',
					500
				);
			}
			throw error;
		}
	}

	private createPrompt(messages: string[]): string {
		const messageText = messages.join('\n');

		// Gemini API 通过 token 而不是字符数来限制，
		// 这里我们仍然保留一个字符限制作为粗略估计
		const truncatedText = messageText.length > CONFIG.GEMINI_MAX_CHARS
			? messageText.slice(0, CONFIG.GEMINI_MAX_CHARS) + '...'
			: messageText;

		return `请总结以下对话的主要内容和关键点。
如果内容包含多个主题，请按主题分类总结。
如果有重要的决定或结论，请重点突出。
保持总结简洁但要包含所有重要信息。

对话内容：
${truncatedText}`;
	}
}

// 使用流式响应的示例（如果需要）：
/*
async function handleStreamingSummary(chatId: number, messages: string[]) {
  const geminiClient = new GeminiClient(env.GEMINI_API_KEY);
  const telegramClient = new TelegramClient(env.TELEGRAM_BOT_TOKEN);

  let summaryText = '';
  const messageId = await telegramClient.sendMessage(chatId, 'Generating summary...');

  for await (const chunk of geminiClient.generateSummaryStream(messages)) {
	summaryText += chunk;
	// 每累积一定数量的文本就更新消息
	if (summaryText.length % 100 === 0) {
	  await telegramClient.editMessage(chatId, messageId, summaryText);
	}
  }

  // 发送最终完整的总结
  await telegramClient.editMessage(chatId, messageId, summaryText);
}
*/
