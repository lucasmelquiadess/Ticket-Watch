export const normalizeBrazilPhone = (input: string) => {
  const digits = input.replace(/\D/g, "");

  if (/^[1-9]{2}9\d{8}$/.test(digits)) {
    return `+55${digits}`;
  }

  throw new Error("Telefone invalido. Use o formato (11)99999-9999.");
};
