// test/index.spec.ts
import { describe, it, expect } from 'vitest';
import {processMarkdownLinks} from "./../src/index"

describe("test fix link", () => {
	it("should fix link", () => {
		const markdown = `
		这是一个测试文本
		[链接11111](链接11111)     // 完全相同，会被处理
		[链接11111](链接11112221)  // 不完全相同，保持原样
		[另一个文本](链接11112221) // 不相同，保持原样
		[链接22222](链接22222)     // 完全相同，会被处理
		[链接11111](链接11111)     // 完全相同，会复用编号
		`;
		const result = processMarkdownLinks(markdown);
		expect(result).toBe(`
		这是一个测试文本
		[引用1](链接11111)     // 完全相同，会被处理
		[链接11111](链接11112221)  // 不完全相同，保持原样
		[另一个文本](链接11112221) // 不相同，保持原样
		[引用2](链接22222)     // 完全相同，会被处理
		[引用1](链接11111)     // 完全相同，会复用编号
		`);
	})
})
