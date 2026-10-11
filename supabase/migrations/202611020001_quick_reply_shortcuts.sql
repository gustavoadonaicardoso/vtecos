-- ============================================================
-- Respostas rápidas: atalho para usar com "/" nas Mensagens
-- ============================================================
-- Rode depois de 202611010001_remove_fiscal.sql.
-- Cada resposta rápida (tabela message_templates) ganha um atalho,
-- como no WhatsApp Business: digitar /boasvindas no campo de mensagem
-- mostra a resposta para inserir. O atalho é único por empresa entre
-- as respostas ativas (sem diferença entre maiúsculas e minúsculas).
--
-- Idempotente: pode rodar mais de uma vez. Respostas antigas ficam
-- sem atalho e continuam funcionando (a busca com "/" acha pelo nome).
-- ============================================================

alter table public.message_templates
  add column if not exists content text,
  add column if not exists shortcut text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.message_templates drop constraint if exists message_templates_shortcut_check;
alter table public.message_templates
  add constraint message_templates_shortcut_check
  check (shortcut is null or shortcut ~ '^[a-z0-9_-]{1,30}$');

create unique index if not exists message_templates_tenant_shortcut_key
  on public.message_templates (tenant_id, lower(shortcut))
  where is_active and shortcut is not null;
