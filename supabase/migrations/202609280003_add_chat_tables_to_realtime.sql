-- ============================================================
-- VÓRTICE CRM — Adiciona tabelas do Chat Interno à publication
-- supabase_realtime (entrega ao vivo via postgres_changes)
-- ============================================================
-- Segunda metade do bug "mensagem só aparece se atualizar a
-- página": a migration anterior (202609280002) corrigiu o RLS,
-- então a query direta do navegador (fetchMessages) já funciona
-- -- por isso os dados aparecem depois de um refresh. Mas o
-- Supabase Realtime (usado por chat/page.tsx via
-- supabase.channel(...).on('postgres_changes', ...)) só entrega
-- eventos de mudança para tabelas explicitamente adicionadas à
-- publication `supabase_realtime` do Postgres. Nenhuma tabela do
-- chat estava nessa publication, então o navegador nunca recebia
-- nenhum evento ao vivo, independente do RLS.
--
-- Mesmo padrão já usado em 202608220001
-- (attendance_queue_tickets): "when duplicate_object then null"
-- torna o bloco seguro para rodar mais de uma vez, mesmo que a
-- tabela já tenha sido adicionada manualmente antes.
--
-- Idempotente: pode ser executada mais de uma vez sem erro.
-- ============================================================

do $$
begin
  alter publication supabase_realtime add table public.internal_chat;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.chat_groups;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.chat_group_members;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.chat_group_messages;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.system_notifications;
exception
  when duplicate_object then null;
end $$;
