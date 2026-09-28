-- ============================================================
-- VÓRTICE CRM — Corrige RLS do Chat Interno (papel anon)
-- ============================================================
-- Causa raiz do bug "mensagens não são enviadas para os outros
-- usuários": o login do app é 100% próprio (localStorage), não usa
-- sessão do Supabase Auth no navegador — o signInWithPassword só
-- acontece dentro da API /api/auth/login, no servidor, e o token
-- nunca é devolvido/aplicado no cliente. Isso já está documentado
-- na migration 202608220001 (attendance_queue_tickets):
--   "The current staff panel uses application-level authentication
--    rather than a Supabase Auth session, so its browser requests
--    have the anon role."
--
-- Ou seja: TODA query feita direto do navegador (supabase.from(...)
-- e as subscriptions supabase.channel(...).on('postgres_changes'))
-- roda com o papel anon do Postgres, nunca authenticated.
--
-- A migration 202609210001 criou as policies do chat só "to
-- authenticated", então o RLS bloqueia silenciosamente:
--  - a leitura do histórico (fetchMessages) em internal_chat e
--    chat_group_messages;
--  - a subscription Realtime (postgres_changes) nessas mesmas
--    tabelas, usada tanto para o REMETENTE ver a própria mensagem
--    aparecer (não há append otimista local em handleSendMessage)
--    quanto para o destinatário recebê-la ao vivo;
--  - leitura/gestão de grupos (chat_groups, chat_group_members);
--  - notificações do sistema (system_notifications);
--  - a listagem de perfis da equipe (profiles) usada para exibir
--    nome do remetente nas mensagens de grupo recebidas via realtime.
--
-- O envio em si (POST /api/chat/messages) sempre funcionou, porque
-- passa pelo supabaseAdmin (service_role, ignora RLS) no servidor —
-- só a entrega/exibição no navegador é que ficava bloqueada.
--
-- Esta migration segue o mesmo padrão já validado em
-- attendance_queue_tickets: adiciona o papel anon nas policies que o
-- navegador precisa para o Chat Interno funcionar. Não muda
-- nenhuma regra de negócio (using/with check continuam "true"),
-- só quem pode usar a policy.
--
-- Idempotente: pode ser executada mais de uma vez sem erro.
-- ============================================================

drop policy if exists "authenticated full access" on public.internal_chat;
create policy "authenticated full access" on public.internal_chat
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.chat_groups;
create policy "authenticated full access" on public.chat_groups
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.chat_group_members;
create policy "authenticated full access" on public.chat_group_members
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.chat_group_messages;
create policy "authenticated full access" on public.chat_group_messages
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.system_notifications;
create policy "authenticated full access" on public.system_notifications
  for all to anon, authenticated using (true) with check (true);

-- profiles: mantém o mesmo escopo (só SELECT amplo, sem
-- UPDATE/DELETE), só adiciona o papel anon para o navegador
-- conseguir listar nomes da equipe (usado no Chat Interno e em
-- outras telas como Leads/Pipeline).
drop policy if exists "authenticated can view team profiles" on public.profiles;
create policy "authenticated can view team profiles" on public.profiles
  for select to anon, authenticated using (true);

grant select, insert, update, delete on public.internal_chat to anon;
grant select, insert, update, delete on public.chat_groups to anon;
grant select, insert, update, delete on public.chat_group_members to anon;
grant select, insert, update, delete on public.chat_group_messages to anon;
grant select, insert, update, delete on public.system_notifications to anon;
grant select on public.profiles to anon;
