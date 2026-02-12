/**
 * Output validator: проверяет final answer агента по JSON schema.
 * Простая реализация без внешних зависимостей; для сложных schema — подключить ajv/zod.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export type OutputSchema = {
  type: 'string';
} | {
  type: 'object';
  required?: string[];
  properties?: Record<string, { type: string }>;
} | {
  type: 'array';
  items?: { type: string };
};

export function validateOutput(output: unknown, schema: OutputSchema): ValidationResult {
  const errors: string[] = [];

  if (schema.type === 'string') {
    if (typeof output !== 'string') {
      errors.push(`Expected string, got ${typeof output}`);
    }
    return { valid: errors.length === 0, errors };
  }

  if (schema.type === 'object') {
    if (typeof output !== 'object' || output === null || Array.isArray(output)) {
      errors.push(`Expected object, got ${Array.isArray(output) ? 'array' : typeof output}`);
      return { valid: false, errors };
    }
    const obj = output as Record<string, unknown>;
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in obj)) {
          errors.push(`Missing required field: ${key}`);
        }
      }
    }
    if (schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        if (key in obj && typeof obj[key] !== prop.type) {
          errors.push(`Field "${key}" expected ${prop.type}, got ${typeof obj[key]}`);
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }

  if (schema.type === 'array') {
    if (!Array.isArray(output)) {
      errors.push(`Expected array, got ${typeof output}`);
      return { valid: false, errors };
    }
    if (schema.items) {
      for (let i = 0; i < output.length; i++) {
        if (typeof output[i] !== schema.items.type) {
          errors.push(`Item [${i}] expected ${schema.items.type}, got ${typeof output[i]}`);
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }

  errors.push(`Unsupported schema type: ${(schema as { type: string }).type}`);
  return { valid: false, errors };
}

/**
 * Парсит final answer как JSON и валидирует по schema.
 * Если final answer — не JSON, считает его строкой и проверяет по schema.type === 'string'.
 */
export function validateFinalAnswer(finalAnswer: string | undefined, schema: OutputSchema): ValidationResult {
  if (finalAnswer === undefined) {
    return { valid: false, errors: ['No final answer'] };
  }

  if (schema.type === 'string') {
    return validateOutput(finalAnswer, schema);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(finalAnswer);
  } catch {
    return { valid: false, errors: [`Final answer is not valid JSON: ${finalAnswer.slice(0, 100)}`] };
  }

  return validateOutput(parsed, schema);
}
