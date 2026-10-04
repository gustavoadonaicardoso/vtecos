-- ============================================================
-- Planos na tela de login
-- ============================================================
-- A tela de login mostrava três planos fixos no código (Essencial,
-- Profissional e Enterprise, com preços que não existiam no sistema).
-- Agora ela lista os planos ativos cadastrados no Painel Master:
--   show_on_login -> o plano aparece em "Conheça nossos planos";
--   featured      -> ganha o selo "Mais popular".
-- Pode rodar mais de uma vez.
-- ============================================================

alter table public.plans add column if not exists show_on_login boolean not null default true;
alter table public.plans add column if not exists featured boolean not null default false;

notify pgrst, 'reload schema';
