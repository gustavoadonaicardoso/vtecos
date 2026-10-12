-- ============================================================
-- Cadastro (teste grátis): código de confirmação do e-mail
-- ============================================================
-- Rode depois de 202611060001_leads_phone_key.sql.
--
-- Quem se cadastra pelo teste grátis recebe um código de 6 dígitos no
-- e-mail e só cria a conta depois de digitar o código (evita contas
-- falsas e garante que as faturas chegam). Guarda só o resumo (hash) do
-- código, por 15 minutos, com no máximo 5 tentativas.
-- Só o servidor lê (RLS ligada, sem policy).
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

create table if not exists public.signup_email_codes (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  sends integer not null default 1,
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.signup_email_codes enable row level security;
revoke all on public.signup_email_codes from anon, authenticated;

comment on column public.signup_email_codes.created_at is 'Início da janela de 1 hora do limite de reenvios (5 por hora).';
