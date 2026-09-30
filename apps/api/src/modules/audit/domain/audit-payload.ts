const MAX_STRING_LENGTH = 2000;
const MAX_ARRAY_ITEMS = 50;
const MAX_DEPTH = 6;

/**
 * Prepara o conteúdo de um evento para a auditoria, limitando o tamanho de
 * textos, listas e objetos aninhados (por exemplo, o resultado de uma tool
 * que devolveu uma página inteira). O registro continua legível e pequeno.
 */
export function compactPayload(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}… (+${value.length - MAX_STRING_LENGTH} caracteres)`
      : value;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (depth >= MAX_DEPTH) {
    return '[conteúdo aninhado omitido]';
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => compactPayload(item, depth + 1));
    const omitted = value.length - MAX_ARRAY_ITEMS;
    return omitted > 0 ? [...items, `… (+${omitted} itens)`] : items;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, compactPayload(item, depth + 1)]),
  );
}
