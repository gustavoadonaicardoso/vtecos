-- ============================================================
-- Módulo E-mail: caixas, mensagens e modelos
-- ============================================================
-- Rode depois de 202611080001_vortice_contact_email.sql.
--
-- Cada empresa conecta as próprias caixas (IMAP para receber, SMTP para
-- enviar). Caixa "compartilhada" (ex.: contato@) aparece para quem tem
-- a permissão E-mail; caixa "pessoal" só para o dono. A senha da caixa
-- fica cifrada (src/lib/secret-box.ts). As três tabelas são só do
-- servidor: RLS ligada e nenhuma policy (as rotas /api/email/* filtram
-- por empresa e por dono).
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

create table if not exists public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null default 'shared',
  owner_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  email_address text not null,
  from_name text not null default '',
  imap_host text not null,
  imap_port integer not null default 993,
  imap_secure boolean not null default true,
  smtp_host text not null,
  smtp_port integer not null default 465,
  smtp_secure boolean not null default true,
  username text not null,
  password_enc text not null,
  signature text not null default '',
  status text not null default 'active',
  last_error text,
  last_sync_at timestamptz,
  uid_validity bigint,
  last_uid bigint not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_accounts_kind_check check (kind in ('shared', 'personal')),
  constraint email_accounts_status_check check (status in ('active', 'error', 'paused')),
  constraint email_accounts_owner_check check (kind = 'shared' or owner_id is not null)
);

create unique index if not exists email_accounts_tenant_address_owner_idx
  on public.email_accounts (tenant_id, lower(email_address), coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists email_accounts_tenant_idx on public.email_accounts (tenant_id);

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  account_id uuid not null references public.email_accounts(id) on delete cascade,
  folder text not null default 'inbox',
  direction text not null default 'in',
  uid bigint,
  message_id text,
  in_reply_to text,
  thread_key text not null,
  from_name text not null default '',
  from_address text not null default '',
  to_list jsonb not null default '[]'::jsonb,
  cc_list jsonb not null default '[]'::jsonb,
  bcc_list jsonb not null default '[]'::jsonb,
  reply_to text,
  subject text not null default '',
  snippet text not null default '',
  body_text text not null default '',
  body_html text,
  attachments jsonb not null default '[]'::jsonb,
  sent_at timestamptz not null default now(),
  is_read boolean not null default false,
  is_starred boolean not null default false,
  sent_by uuid references public.profiles(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint email_messages_folder_check check (folder in ('inbox', 'sent', 'trash')),
  constraint email_messages_direction_check check (direction in ('in', 'out'))
);

-- Uma mensagem do servidor (UID) entra uma vez só por caixa.
create unique index if not exists email_messages_account_uid_idx on public.email_messages (account_id, uid) where uid is not null;
create index if not exists email_messages_list_idx on public.email_messages (tenant_id, account_id, folder, sent_at desc);
create index if not exists email_messages_thread_idx on public.email_messages (account_id, thread_key);
create index if not exists email_messages_message_id_idx on public.email_messages (account_id, message_id);

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  subject text not null default '',
  body text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists email_templates_tenant_idx on public.email_templates (tenant_id, name);

alter table public.email_accounts enable row level security;
alter table public.email_messages enable row level security;
alter table public.email_templates enable row level security;
revoke all on public.email_accounts from anon, authenticated;
revoke all on public.email_messages from anon, authenticated;
revoke all on public.email_templates from anon, authenticated;

-- Anexos (arquivos recebidos e enviados): bucket privado, baixados pela rota /api/email/attachments.
insert into storage.buckets (id, name, public)
values ('email-attachments', 'email-attachments', false)
on conflict (id) do nothing;
