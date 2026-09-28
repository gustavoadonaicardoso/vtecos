-- attendance_queue_tickets tinha "select to anon using (true)" -- a
-- tabela inteira (incluindo whatsapp e document/CPF-RG de TODO visitante
-- que já passou pelo Totem, não só quem aparece no Painel) ficava
-- legível por qualquer pessoa com a chave pública do site (embutida no
-- JS de qualquer página). Painel (Display) e Recepção (Queue) usam o
-- client anon direto do navegador -- não têm como provar "sou a
-- recepção" nesse nível, então a única forma de fechar isso sem quebrar
-- o Realtime de ambas as telas é tirar o dado sensível da tabela que o
-- anon lê, não tentar restringir por linha/coluna nela.
--
-- Depois desta migration: whatsapp/document moram numa tabela separada
-- que nem anon nem authenticated conseguem ler -- só o servidor
-- (supabaseAdmin, que ignora RLS) grava e lê. attendance_queue_tickets
-- continua com o mesmo comportamento de sempre (nome, número, guichê,
-- status), só sem as duas colunas sensíveis.

create table if not exists public.attendance_queue_contacts (
  ticket_id uuid primary key references public.attendance_queue_tickets(id) on delete cascade,
  whatsapp text,
  document text,
  created_at timestamptz not null default now()
);

-- Migra o que já existe antes de derrubar as colunas da tabela pública.
insert into public.attendance_queue_contacts (ticket_id, whatsapp, document)
select id, whatsapp, document
from public.attendance_queue_tickets
where whatsapp is not null or document is not null
on conflict (ticket_id) do nothing;

alter table public.attendance_queue_tickets drop column if exists whatsapp;
alter table public.attendance_queue_tickets drop column if exists document;

alter table public.attendance_queue_contacts enable row level security;
-- Nenhuma policy criada de propósito: RLS ligada sem policy = ninguém
-- (nem anon, nem authenticated) consegue ler/escrever. Só supabaseAdmin
-- (service role, ignora RLS) acessa.
revoke all on public.attendance_queue_contacts from anon, authenticated;
