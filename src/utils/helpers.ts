import { v4 as uuidv4 } from 'uuid';

/**
 * Generate unique ID
 */
export function generateId(prefix?: string): string {
  const uuid = uuidv4();
  return prefix ? `${prefix}_${uuid}` : uuid;
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries: number;
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
  }
): Promise<T> {
  let lastError: any;
  let delay = options.initialDelay;

  for (let i = 0; i <= options.maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (i < options.maxRetries) {
        await sleep(delay);
        delay = Math.min(delay * options.backoffMultiplier, options.maxDelay);
      }
    }
  }

  throw lastError;
}

/**
 * Format tokens to readable string
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(2)}M`;
  } else if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(2)}K`;
  }
  return tokens.toString();
}

/**
 * Calculate cost based on tokens
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  costPer1k: { input: number; output: number }
): number {
  const inputCost = (inputTokens / 1000) * costPer1k.input;
  const outputCost = (outputTokens / 1000) * costPer1k.output;
  return inputCost + outputCost;
}

/**
 * Truncate string to max length
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Parse JSON safely
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

/**
 * Deep clone object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Validate required fields in object
 */
export function validateRequired(
  obj: Record<string, any>,
  fields: string[]
): { valid: boolean; missing: string[] } {
  const missing = fields.filter((field) => !obj[field]);
  return {
    valid: missing.length === 0,
    missing
  };
}

/**
 * Format duration in ms to readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(2)}m`;
  return `${(ms / 3600000).toFixed(2)}h`;
}

/**
 * Extract variables from template string
 */
export function extractVariables(template: string): string[] {
  const regex = /\{\{([^}]+)\}\}/g;
  const variables: string[] = [];
  let match;

  while ((match = regex.exec(template)) !== null) {
    variables.push(match[1].trim());
  }

  return [...new Set(variables)];
}

/**
 * Replace variables in template
 */
export function replaceVariables(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    return variables[key.trim()] || '';
  });
}
