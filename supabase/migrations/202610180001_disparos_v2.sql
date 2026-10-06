-- ============================================================
-- Disparos v2: envio pelo servidor, agendamento e descadastro
-- ============================================================
-- Rode depois de 202610170001_automations_v2.sql.
--
-- Antes o navegador mandava um contato por vez: fechar a aba parava a
-- campanha. Agora o servidor envia sozinho (fila com intervalo
-- aleatório, janela de horário e limite por dia), e:
--   blast_campaigns  -> agendamento, janela, limite diário, público do
--                       CRM, variações, anexo, canal (WhatsApp Web ou
--                       template da API oficial), o que fazer quando o
--                       contato responde e contadores;
--   blast_contacts   -> lead ligado, quando respondeu, motivo de ter
--                       sido pulado;
--   whatsapp_optouts -> quem pediu para não receber campanhas (SAIR).
-- Só o servidor acessa estas tabelas. Pode rodar mais de uma vez.
-- ============================================================

create table if not exists public.blast_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  template text not null default '',
  columns_config jsonb not null default '[]'::jsonb,
  delay_min integer not null default 8,
  delay_max integer not null default 20,
  status text not null default 'draft',
  total_contacts integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  route_type text not null default 'none',
  route_to_id text,
  route_to_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.blast_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  campaign_id uuid not null references public.blast_campaigns (id) on delete cascade,
  phone text not null default '',
  data jsonb not null default '{}'::jsonb,
  rendered_message text,
  status text not null default 'pending',
  error_msg text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Colunas que bancos antigos podem não ter.
alter table public.blast_campaigns
  add column if not exists template text not null default '',
  add column if not exists columns_config jsonb not null default '[]'::jsonb,
  add column if not exists delay_min integer not null default 8,
  add column if not exists delay_max integer not null default 20,
  add column if not exists status text not null default 'draft',
  add column if not exists total_contacts integer not null default 0,
  add column if not exists sent_count integer not null default 0,
  add column if not exists failed_count integer not null default 0,
  add column if not exists route_type text not null default 'none',
  add column if not exists route_to_id text,
  add column if not exists route_to_label text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  -- v2
  add column if not exists variants text[] not null default '{}',
  add column if not exists channel text not null default 'web',
  add column if not exists meta_template jsonb,
  add column if not exists media_url text,
  add column if not exists media_kind text,
  add column if not exists media_name text,
  add column if not exists optout_text text,
  add column if not exists audience jsonb not null default '{}'::jsonb,
  add column if not exists create_leads boolean not null default false,
  add column if not exists scheduled_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists send_window jsonb,
  add column if not exists daily_limit integer,
  add column if not exists next_send_at timestamptz,
  add column if not exists fail_streak integer not null default 0,
  add column if not exists status_detail text,
  add column if not exists last_error text,
  add column if not exists skipped_count integer not null default 0,
  add column if not exists replied_count integer not null default 0,
  add column if not exists optout_count integer not null default 0,
  add column if not exists pending_count integer not null default 0,
  add column if not exists tag_on_reply text,
  add column if not exists flow_on_reply uuid,
  add column if not exists created_by uuid;

alter table public.blast_contacts
  add column if not exists data jsonb not null default '{}'::jsonb,
  add column if not exists rendered_message text,
  add column if not exists status text not null default 'pending',
  add column if not exists error_msg text,
  add column if not exists sent_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  -- v2
  add column if not exists lead_id uuid,
  add column if not exists name text,
  add column if not exists sending_at timestamptz,
  add column if not exists replied_at timestamptz,
  add column if not exists reply_text text,
  add column if not exists position integer not null default 0;

-- Situações da campanha e do contato.
alter table public.blast_campaigns drop constraint if exists blast_campaigns_status_check;
update public.blast_campaigns set status = 'paused' where status = 'running';
update public.blast_campaigns set status = 'completed' where status not in ('draft', 'scheduled', 'running', 'paused', 'completed', 'canceled');
alter table public.blast_campaigns add constraint blast_campaigns_status_check
  check (status in ('draft', 'scheduled', 'running', 'paused', 'completed', 'canceled'));

alter table public.blast_campaigns drop constraint if exists blast_campaigns_channel_check;
alter table public.blast_campaigns add constraint blast_campaigns_channel_check check (channel in ('web', 'api'));

alter table public.blast_contacts drop constraint if exists blast_contacts_status_check;
-- Contato que ficou "enviando" quando o envio era pelo navegador: não reenvia.
update public.blast_contacts set status = 'failed', error_msg = coalesce(error_msg, 'Envio interrompido (versão antiga dos Disparos).') where status = 'sending';
update public.blast_contacts set status = 'failed' where status not in ('pending', 'sending', 'sent', 'failed', 'skipped', 'canceled');
alter table public.blast_contacts add constraint blast_contacts_status_check
  check (status in ('pending', 'sending', 'sent', 'failed', 'skipped', 'canceled'));

create index if not exists blast_campaigns_tenant_idx on public.blast_campaigns (tenant_id, created_at desc);
create index if not exists blast_campaigns_queue_idx on public.blast_campaigns (status, next_send_at);
create index if not exists blast_contacts_queue_idx on public.blast_contacts (campaign_id, status, position);
create index if not exists blast_contacts_phone_idx on public.blast_contacts (tenant_id, phone, sent_at desc);

-- Quem pediu para não receber campanhas.
create table if not exists public.whatsapp_optouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  phone text not null,
  reason text not null default '',
  campaign_id uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists whatsapp_optouts_phone_idx on public.whatsapp_optouts (tenant_id, phone);

-- Só o servidor (rotas /api/disparos e o envio em segundo plano).
alter table public.blast_campaigns enable row level security;
alter table public.blast_contacts enable row level security;
alter table public.whatsapp_optouts enable row level security;
drop policy if exists "authenticated full access" on public.blast_campaigns;
drop policy if exists "authenticated full access" on public.blast_contacts;
drop policy if exists "tenant isolation" on public.blast_campaigns;
drop policy if exists "tenant isolation" on public.blast_contacts;
revoke all on public.blast_campaigns from anon, authenticated;
revoke all on public.blast_contacts from anon, authenticated;
revoke all on public.whatsapp_optouts from anon, authenticated;

notify pgrst, 'reload schema';
