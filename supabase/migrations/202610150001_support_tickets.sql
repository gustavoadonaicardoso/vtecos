-- ============================================================
-- Central de chamados: clientes (empresas) abrem, a Vórtice responde
-- ============================================================
-- Rode depois de 202610140001_queue_review.sql.
--
-- Antes, "Abrir chamado" na Central de Ajuda só mandava um aviso no sino
-- dos administradores da Vórtice: não havia lista, resposta, situação nem
-- histórico para o cliente acompanhar.
--
-- support_tickets          um chamado (tenant_id = empresa CLIENTE que abriu)
-- support_ticket_messages  a conversa: cliente, Vórtice, notas internas
--                          (só a Vórtice vê) e registros do sistema
-- Bucket privado support-files para anexos (prints, PDFs).
--
-- Só o servidor lê e grava (RLS ligada, sem policy): o cliente vê só os
-- chamados da empresa dele e nunca as notas internas.
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

create sequence if not exists public.support_ticket_code_seq start with 1001;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  code bigint not null unique default nextval('public.support_ticket_code_seq'),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  opened_by uuid references public.profiles(id) on delete set null,
  subject text not null,
  category text not null default 'duvida'
    check (category in ('duvida', 'problema', 'pedido', 'financeiro', 'outro')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
  assigned_to uuid references public.profiles(id) on delete set null,
  contact_phone text,
  notify_whatsapp boolean not null default false,
  unread_by_staff boolean not null default true,
  unread_by_customer boolean not null default false,
  first_response_at timestamptz,
  last_customer_at timestamptz,
  last_staff_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  rating integer check (rating is null or rating between 1 and 5),
  rating_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter sequence public.support_ticket_code_seq owned by public.support_tickets.code;

create index if not exists support_tickets_tenant_idx on public.support_tickets (tenant_id, updated_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets (status, updated_at desc);
create index if not exists support_tickets_assigned_idx on public.support_tickets (assigned_to) where status not in ('resolved', 'closed');

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  author_side text not null check (author_side in ('customer', 'staff', 'system')),
  body text not null default '',
  internal boolean not null default false,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists support_ticket_messages_ticket_idx on public.support_ticket_messages (ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
revoke all on public.support_tickets from anon, authenticated;
revoke all on public.support_ticket_messages from anon, authenticated;
revoke all on sequence public.support_ticket_code_seq from anon, authenticated;

-- Anexos: bucket PRIVADO (o servidor entrega links temporários).
insert into storage.buckets (id, name, public, file_size_limit)
values ('support-files', 'support-files', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;
