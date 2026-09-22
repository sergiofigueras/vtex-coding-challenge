/**
 * Reviewed version-1 alias data. Aliases are exact canonical phrases, never
 * substring replacements. Changes require an ADR and collision evidence.
 */
export const PRODUCT_IDENTITY_ALIAS_VERSION = 1;

export const PRODUCT_IDENTITY_ALIASES = {
  name: {
    roteador: 'router',
    processador: 'processor',
  },
  brand: {},
  category: {
    photo: 'photography',
  },
} as const;
