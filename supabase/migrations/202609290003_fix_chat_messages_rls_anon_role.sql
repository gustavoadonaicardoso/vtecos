-- chat_messages (histórico de conversa com leads via WhatsApp) ficou de
-- fora da correção 202609280002_fix_chat_rls_anon_role.sql -- a policy
-- continuava só "to authenticated", e o navegador nunca tem sessão real
-- do Supabase Auth (login é 100% server-side). Resultado: mensagem
-- enviada saía de verdade pelo WhatsApp (o envio roda no servidor,
-- com supabaseAdmin), mas nem ela nem as respostas apareciam na tela,
-- porque a LEITURA (direto do navegador, anon) era bloqueada.
--
-- Mesmo padrão já usado pro chat interno: adiciona o papel anon na
-- policy e na publicação de Realtime. Idempotente.

drop policy if exists "authenticated full access" on public.chat_messages;
create policy "authenticated full access" on public.chat_messages
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.chat_messages to anon;

do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception
  when duplicate_object then null;
end $$;
