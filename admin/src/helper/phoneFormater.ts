export const PhoneFormat = (value: string = ""): string => {
  if (!value) return "";

  let cleaned = value.replace(/\D/g, "");

  // Se começar com 55 e tiver mais de 10 dígitos, remove o 55
  if (cleaned.startsWith("55") && cleaned.length > 10) {
    cleaned = cleaned.substring(2);
  }

  // Limita a 11 dígitos (DDD + 9 dígitos celular)
  cleaned = cleaned.slice(0, 11);

  if (cleaned.length === 11) {
    return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7)}`;
  } else if (cleaned.length === 10) {
    return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 6)}-${cleaned.substring(6)}`;
  }

  return cleaned;
};
