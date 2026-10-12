-- ============================================================
-- Módulo E-mail (parte 2): aviso no sino e e-mails por lead
-- ============================================================
-- Rode depois de 202611090001_email_module.sql.
--
-- notify: avisar no sino quando chega e-mail nesta caixa (cada caixa
-- pode desligar). O índice deixa rápido listar os e-mails de um lead
-- (painel do lead).
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

alter table public.email_accounts add column if not exists notify boolean not null default true;

create index if not exists email_messages_lead_idx on public.email_messages (tenant_id, lead_id, sent_at desc) where lead_id is not null;
create index if not exists email_messages_from_idx on public.email_messages (tenant_id, lower(from_address));
