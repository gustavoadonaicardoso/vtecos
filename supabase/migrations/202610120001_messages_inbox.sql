-- ============================================================
-- Mensagens: caixa de entrada de verdade
-- ============================================================
-- Antes a lista de conversas inventava "não lidas" e abas, e era
-- ordenada pela data de cadastro do lead. Agora:
--   leads.unread_count   -> mensagens do cliente ainda não vistas
--                           pela equipe (zera ao abrir a conversa ou
--                           ao responder);
--   leads.last_activity_at -> última mensagem (de qualquer lado),
--                           usada para ordenar a lista.
-- Um gatilho em chat_messages mantém os dois sozinho -- vale para
-- WhatsApp Web, API oficial, automações e respostas da equipe.
-- Também garante as colunas de chat_messages que o sistema usa.
-- Pode rodar mais de uma vez.
-- ============================================================

do $$
begin
  if to_regclass('public.leads') is not null then
    alter table public.leads add column if not exists unread_count integer not null default 0;
    alter table public.leads add column if not exists last_activity_at timestamptz;
    create index if not exists leads_tenant_activity_idx on public.leads (tenant_id, last_activity_at desc nulls last);
  end if;

  if to_regclass('public.chat_messages') is not null then
    alter table public.chat_messages add column if not exists text text;
    alter table public.chat_messages add column if not exists type text not null default 'text';
    alter table public.chat_messages add column if not exists audio_url text;
    alter table public.chat_messages add column if not exists sent_by_me boolean not null default false;
    alter table public.chat_messages add column if not exists status text;
    alter table public.chat_messages add column if not exists provider text;
    alter table public.chat_messages add column if not exists external_id text;
    alter table public.chat_messages add column if not exists sent_by uuid;
    create index if not exists chat_messages_tenant_lead_idx on public.chat_messages (tenant_id, lead_id, created_at);
  end if;
end $$;

create or replace function public.chat_messages_touch_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- lead_id pode ser uuid ou texto, conforme o banco; só segue com um uuid válido.
  if new.lead_id is null or new.lead_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return new;
  end if;

  update public.leads
  set last_activity_at = coalesce(new.created_at, now()),
      -- Resposta da equipe (ou do robô) = conversa vista.
      unread_count = case when coalesce(new.sent_by_me, false) then 0 else unread_count + 1 end
  where id = new.lead_id::text::uuid
    and tenant_id = new.tenant_id;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.chat_messages') is null then return; end if;
  drop trigger if exists chat_messages_touch_lead on public.chat_messages;
  create trigger chat_messages_touch_lead
    after insert on public.chat_messages
    for each row execute function public.chat_messages_touch_lead();
end $$;

-- Leads que já têm conversa: última atividade = última mensagem.
do $$
begin
  if to_regclass('public.chat_messages') is null or to_regclass('public.leads') is null then return; end if;
  update public.leads l
  set last_activity_at = m.last_at
  from (
    select lead_id::text as lead_key, max(created_at) as last_at
    from public.chat_messages
    where lead_id is not null
    group by lead_id::text
  ) m
  where l.id::text = m.lead_key
    and (l.last_activity_at is null or l.last_activity_at < m.last_at);
end $$;

notify pgrst, 'reload schema';
