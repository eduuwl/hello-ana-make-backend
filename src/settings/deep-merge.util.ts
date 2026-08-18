type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Merge profundo por grupo (docs/15-configuracoes.md → "Body: parcial ou completo"). */
export function deepMerge<T extends PlainObject>(base: T, patch: Partial<T>): T {
  const result: PlainObject = { ...base };
  for (const key of Object.keys(patch)) {
    const patchValue = patch[key as keyof T];
    const baseValue = result[key];
    if (patchValue === undefined) continue;
    result[key] = isPlainObject(patchValue) && isPlainObject(baseValue) ? deepMerge(baseValue, patchValue) : patchValue;
  }
  return result as T;
}
