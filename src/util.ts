import { CONFIG } from "./config";
import { BotError } from "./errors";

export async function retry<T>(
	fn: () => Promise<T>,
	attempts: number = CONFIG.RETRY_ATTEMPTS,
	delay: number = CONFIG.RETRY_DELAY
  ): Promise<T> {
	try {
	  return await fn();
	} catch (error) {
	  if (attempts <= 1) throw error;
	  await new Promise(resolve => setTimeout(resolve, delay));
	  return retry(fn, attempts - 1, delay);
	}
  }

  export function validateHours(hours: number): void {
	if (
	  isNaN(hours) ||
	  hours < CONFIG.MIN_SUMMARY_HOURS ||
	  hours > CONFIG.MAX_SUMMARY_HOURS
	) {
	  throw new BotError(
		`Hours must be a number between ${CONFIG.MIN_SUMMARY_HOURS} and ${CONFIG.MAX_SUMMARY_HOURS}`,
		'INVALID_HOURS'
	  );
	}
  }
