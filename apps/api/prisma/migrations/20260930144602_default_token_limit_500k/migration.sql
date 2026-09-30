-- O limite padrão de tokens por usuário passa de 2 milhões para 500 mil (DEFAULT_TOKEN_LIMIT).
-- Contas que ainda estão no padrão antigo acompanham a mudança; limites definidos por um
-- administrador com outro valor são mantidos.
UPDATE "credit_accounts" SET "token_limit" = 500000 WHERE "token_limit" = 2000000;
