-- ============================================================
-- Planos: CRM dividido em módulos, limites por plano e os 4 planos
-- ============================================================
-- Rode depois de 202610300001_finance_software.sql.
-- RODE ANTES DO DEPLOY: sem ela, os planos que têm "CRM" perdem
-- Automações, Disparos e Discador (que viraram módulos próprios).
--
-- 1) O módulo "crm" deixa de incluir Automações, Disparos e Discador.
--    Todo plano que já tinha "crm" ganha os três (ninguém perde nada).
-- 2) Limites do plano (vazio = sem limite; 0 = não incluído):
--    usuários ativos, usos da IA da Vórtice por mês e mensagens de
--    disparo por dia.
-- 3) tenant_usage + consume_tenant_usage(): contador atômico de uso.
-- 4) Os 4 planos de venda (Precificação, Essencial, Profissional,
--    Completo) -- só se ainda não existir plano com o mesmo nome.
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

-- 1) Quem tinha "crm" continua com tudo que ele liberava. Só na primeira
--    vez (antes das colunas de limite existirem): depois disso, plano
--    com "crm" sem automações é escolha (ex.: Essencial).
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'plans' and column_name = 'max_users'
  ) then
    update public.plans
    set modules = modules || array['automacoes', 'disparos', 'discador']
    where 'crm' = any(modules)
      and not (modules && array['automacoes', 'disparos', 'discador']);
  end if;
end $$;

-- 2) Limites.
alter table public.plans
  add column if not exists max_users integer,
  add column if not exists ai_monthly_limit integer,
  add column if not exists blast_daily_limit integer;

alter table public.plans drop constraint if exists plans_limits_check;
alter table public.plans
  add constraint plans_limits_check check (
    (max_users is null or max_users >= 0)
    and (ai_monthly_limit is null or ai_monthly_limit >= 0)
    and (blast_daily_limit is null or blast_daily_limit >= 0)
  );

-- 3) Uso por empresa e período (mês para IA).
create table if not exists public.tenant_usage (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  metric text not null,
  period date not null,
  amount integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, metric, period)
);

alter table public.tenant_usage enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.tenant_usage from anon, authenticated;
  end if;
end $$;

-- Soma 1 se ainda couber no limite (null = sem limite). Devolve o total
-- depois de somar, ou -1 se o limite já foi atingido.
create or replace function public.consume_tenant_usage(p_tenant uuid, p_metric text, p_period date, p_limit integer default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount integer;
begin
  insert into tenant_usage (tenant_id, metric, period, amount)
  values (p_tenant, p_metric, p_period, 0)
  on conflict (tenant_id, metric, period) do nothing;

  update tenant_usage
  set amount = amount + 1, updated_at = now()
  where tenant_id = p_tenant and metric = p_metric and period = p_period
    and (p_limit is null or amount < p_limit)
  returning amount into v_amount;

  return coalesce(v_amount, -1);
end;
$$;

revoke all on function public.consume_tenant_usage(uuid, text, date, integer) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.consume_tenant_usage(uuid, text, date, integer) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.consume_tenant_usage(uuid, text, date, integer) to service_role;
  end if;
end $$;

-- 4) Os planos de venda (preços e limites editáveis no Painel Master).
insert into public.plans (name, description, price, modules, active, show_on_login, featured, max_users, ai_monthly_limit, blast_daily_limit)
select v.name, v.description, v.price, v.modules, true, true, v.featured, v.max_users, v.ai_monthly_limit, v.blast_daily_limit
from (values
  ('Precificação', 'Custo de cada produto ou serviço, preço certo em cada canal e lucro do mês.', 29.00,
    array['financeiro'], false, 1, 0, 0),
  ('Essencial', 'Para quem vende pelo WhatsApp: leads, funil, conversas, agenda e relatórios.', 59.00,
    array['crm', 'agendamento', 'financeiro'], false, 2, 0, 0),
  ('Profissional', 'Para equipes que querem automatizar: automações, Atendente com IA, Direct e Messenger, redes sociais e disparos.', 119.00,
    array['crm', 'automacoes', 'disparos', 'agendamento', 'financeiro', 'social'], true, 5, 500, 100),
  ('Completo', 'Tudo do Profissional, mais discador, senhas com totem e TV, planejamentos e projetos.', 229.00,
    array['crm', 'automacoes', 'disparos', 'discador', 'agendamento', 'financeiro', 'social', 'senhas', 'planejamentos'], false, 10, 2000, 300)
) as v(name, description, price, modules, featured, max_users, ai_monthly_limit, blast_daily_limit)
where not exists (select 1 from public.plans p where lower(p.name) = lower(v.name));
