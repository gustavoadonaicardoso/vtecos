-- ============================================================
-- Central de Ajuda: tutoriais padrão atualizam sozinhos
-- ============================================================
-- default_hash guarda a impressão digital do texto padrão gravado. Se o
-- artigo continua igual ao que foi gravado (ninguém editou no Painel
-- Master), a versão nova do texto padrão entra sozinha quando o servidor
-- sobe. Artigo editado à mão nunca é sobrescrito.
-- Idempotente.
-- ============================================================

alter table public.help_articles add column if not exists default_hash text;
