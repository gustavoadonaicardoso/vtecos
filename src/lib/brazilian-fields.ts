export function parseBrazilPhoneInput(value: string): string {
  let digits = value.replace(/\D/g, '');

  // The controlled input always renders +55. Also accepts pasted E.164 values.
  if ((value.trim().startsWith('+55') || digits.length > 11) && digits.startsWith('55')) {
    digits = digits.slice(2);
  }

  return digits.slice(0, 11);
}

export function formatBrazilPhone(nationalDigits: string): string {
  const digits = nationalDigits.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '+55 ';

  const areaCode = digits.slice(0, 2);
  const subscriber = digits.slice(2);
  const splitAt = subscriber.length > 8 ? 5 : 4;
  const firstPart = subscriber.slice(0, splitAt);
  const secondPart = subscriber.slice(splitAt, splitAt + 4);

  return `+55 (${areaCode}${areaCode.length === 2 ? ') ' : ''}${firstPart}${secondPart ? `-${secondPart}` : ''}`;
}

export function normalizeBrazilPhone(nationalDigits: string): string {
  const digits = parseBrazilPhoneInput(nationalDigits);
  return digits ? `+55${digits}` : '';
}

export function validateBrazilPhone(nationalDigits: string): string | null {
  const digits = parseBrazilPhoneInput(nationalDigits);
  if (!digits) return null;
  if (digits.length !== 10 && digits.length !== 11) {
    return 'Informe o DDD e o número completo do WhatsApp.';
  }
  if (digits[0] === '0' || digits[1] === '0') return 'Informe um DDD válido.';
  if (digits.length === 11 && digits[2] !== '9') {
    return 'Celulares com 11 dígitos devem começar com 9 após o DDD.';
  }
  return null;
}

export function parseBrazilDocumentInput(value: string): string {
  const cleaned = value.toUpperCase().replace(/[^0-9X]/g, '');
  if (cleaned.includes('X')) {
    return `${cleaned.replace(/X/g, '').slice(0, 8)}X`;
  }
  return cleaned.slice(0, 11);
}

export function formatBrazilDocument(documentValue: string): string {
  const value = parseBrazilDocumentInput(documentValue);
  if (/^\d{11}$/.test(value)) {
    return value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (value.length <= 9) {
    return value
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{2})\.(\d{3})\.(\d{3})([0-9X])$/, '$1.$2.$3-$4');
  }
  return value;
}

export function isValidCPF(value: string): boolean {
  const cpf = value.replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calculateDigit = (length: number) => {
    const sum = cpf.slice(0, length).split('').reduce(
      (total, digit, index) => total + Number(digit) * (length + 1 - index),
      0,
    );
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calculateDigit(9) === Number(cpf[9]) && calculateDigit(10) === Number(cpf[10]);
}

export function validateBrazilDocument(documentValue: string): string | null {
  const value = parseBrazilDocumentInput(documentValue);
  if (!value) return null;
  if (value.length === 11) return isValidCPF(value) ? null : 'Informe um CPF válido.';
  if (value.length >= 7 && value.length <= 9) return null;
  return 'Informe um CPF com 11 dígitos ou um RG com 7 a 9 caracteres.';
}
