-- system_notifications tinha uma única policy "for all to anon, authenticated
-- using (true) with check (true)" -- qualquer pessoa com a chave pública do
-- site podia ler, criar, marcar como lida ou apagar a notificação de
-- QUALQUER usuário (prévias de chat, atribuição de lead, links). O filtro
-- por user_id nas telas era só convenção do cliente, nunca segurança real.
--
-- Como não existe sessão real do Supabase Auth no navegador (login é
-- 100% server-side, ver src/lib/session.ts), não dá pra escrever uma
-- policy "só o dono vê" baseada em auth.uid() para o anon. A correção
-- é tirar o anon da tabela por completo -- toda leitura/escrita agora
-- passa por /api/notifications (route handler com supabaseAdmin,
-- gated pela sessão httpOnly), que já foi ajustada antes desta
-- migration ser aplicada.

drop policy if exists "authenticated full access" on public.system_notifications;
create policy "authenticated full access" on public.system_notifications
  for all to authenticated using (true) with check (true);

revoke select, insert, update, delete on public.system_notifications from anon;
