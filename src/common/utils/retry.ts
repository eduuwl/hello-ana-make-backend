/**
 * Reexecuta `fn` em caso de falha, com um pequeno intervalo entre tentativas.
 * Uso: operações no nosso banco que vêm *depois* de uma ação externa que já
 * aconteceu de verdade (ex.: gravar localmente uma cobrança que o gateway de
 * pagamento já criou) — falha transitória aqui não pode virar "não sei se
 * cobrei o cliente".
 */
export async function retry<T>(
  fn: () => Promise<T>,
  { attempts = 3, delayMs = 300 }: { attempts?: number; delayMs?: number } = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
  throw lastError;
}
