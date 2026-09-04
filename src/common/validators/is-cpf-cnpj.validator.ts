import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Valida CPF (11 dígitos) pelo algoritmo padrão de dígito verificador.
 * Descoberto em produção: o Asaas rejeita CPF mal formado só na hora de
 * cobrar (tokenizeCard/createPayment), tarde demais pro usuário corrigir
 * sem perder o checkout — validar aqui pega o erro na hora de salvar o perfil.
 */
function isValidCpf(digits: string): boolean {
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

  const calcDigit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += parseInt(digits[i], 10) * (length + 1 - i);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  return calcDigit(9) === parseInt(digits[9], 10) && calcDigit(10) === parseInt(digits[10], 10);
}

/** Valida CNPJ (14 dígitos) pelo algoritmo padrão de dígito verificador. */
function isValidCnpj(digits: string): boolean {
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;

  const calcDigit = (length: number): number => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += parseInt(digits[i], 10) * weights[i];
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  return calcDigit(12) === parseInt(digits[12], 10) && calcDigit(13) === parseInt(digits[13], 10);
}

export function isValidCpfCnpj(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
}

/** Decorator class-validator: aceita CPF (11 dígitos) ou CNPJ (14), com ou sem máscara. */
export function IsCpfCnpj(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCpfCnpj',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isValidCpfCnpj(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} inválido (CPF ou CNPJ com dígito verificador incorreto).`;
        },
      },
    });
  };
}
