-- ============================================================
-- Direct do Instagram e Messenger em Mensagens
-- ============================================================
-- Quem manda mensagem no Direct do Instagram ou na Página do Facebook
-- vira lead e conversa em Mensagens, igual ao WhatsApp.
--
-- leads.instagram_id / messenger_id   -> quem é a pessoa para a Meta
--                                        (um id por conta da empresa);
-- leads.instagram_account_id / ...    -> por qual conta conectada
--                                        (Redes Sociais > Contas) responder;
-- leads.chat_channel                  -> canal da última mensagem do
--                                        cliente: a resposta sai por ele
--                                        (null = WhatsApp, como antes);
-- social_accounts.messaging_status    -> recebimento de mensagens ligado
--                                        na Página ('on', 'error' ou null).
-- Pode rodar mais de uma vez.
-- ============================================================

alter table public.leads add column if not exists instagram_id text;
alter table public.leads add column if not exists instagram_username text;
alter table public.leads add column if not exists instagram_account_id uuid references public.social_accounts (id) on delete set null;
alter table public.leads add column if not exists messenger_id text;
alter table public.leads add column if not exists messenger_account_id uuid references public.social_accounts (id) on delete set null;
alter table public.leads add column if not exists chat_channel text;

alter table public.leads drop constraint if exists leads_chat_channel_check;
alter table public.leads add constraint leads_chat_channel_check check (chat_channel is null or chat_channel in ('whatsapp', 'instagram', 'messenger'));

create unique index if not exists leads_tenant_instagram_idx on public.leads (tenant_id, instagram_id) where instagram_id is not null;
create unique index if not exists leads_tenant_messenger_idx on public.leads (tenant_id, messenger_id) where messenger_id is not null;

alter table public.social_accounts add column if not exists messaging_status text;
alter table public.social_accounts add column if not exists messaging_error text;

-- Mensagem repetida da Meta (o webhook pode chegar duas vezes).
create index if not exists chat_messages_tenant_external_idx on public.chat_messages (tenant_id, external_id) where external_id is not null;

notify pgrst, 'reload schema';
