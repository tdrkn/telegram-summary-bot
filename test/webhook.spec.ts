// test/webhook.spec.ts
import { describe, it, expect } from 'vitest';

// Mock functions for testing
function pickMsg(update: any) {
	const msg =
		update.message ??
		update.edited_message ??
		update.channel_post ??
		update.edited_channel_post ??
		update.callback_query?.message ??
		null;
	return msg;
}

describe("pickMsg function", () => {
	it("should extract message from regular update", () => {
		const update = {
			message: {
				chat: { id: 123 },
				text: "/status"
			}
		};
		const result = pickMsg(update);
		expect(result).toBeDefined();
		expect(result.chat.id).toBe(123);
		expect(result.text).toBe("/status");
	});

	it("should extract message from edited_message update", () => {
		const update = {
			edited_message: {
				chat: { id: 456 },
				text: "edited text"
			}
		};
		const result = pickMsg(update);
		expect(result).toBeDefined();
		expect(result.chat.id).toBe(456);
		expect(result.text).toBe("edited text");
	});

	it("should return null for my_chat_member update", () => {
		const update = {
			my_chat_member: {
				chat: { id: 789 },
				from: { id: 123 },
				old_chat_member: { status: "left" },
				new_chat_member: { status: "member" }
			}
		};
		const result = pickMsg(update);
		expect(result).toBeNull();
	});

	it("should return null for chat_member update", () => {
		const update = {
			chat_member: {
				chat: { id: 789 },
				from: { id: 123 },
				old_chat_member: { status: "member" },
				new_chat_member: { status: "administrator" }
			}
		};
		const result = pickMsg(update);
		expect(result).toBeNull();
	});

	it("should extract message from callback_query update", () => {
		const update = {
			callback_query: {
				message: {
					chat: { id: 999 },
					text: "callback message"
				}
			}
		};
		const result = pickMsg(update);
		expect(result).toBeDefined();
		expect(result.chat.id).toBe(999);
		expect(result.text).toBe("callback message");
	});
});