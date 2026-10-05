-- ============================================================
-- Pipeline: há quanto tempo o lead está na etapa
-- ============================================================
-- O cartão do funil mostrava "0d" para todo mundo (o campo nunca era
-- preenchido). Agora leads.stage_changed_at guarda quando o lead entrou
-- na etapa atual. Um gatilho atualiza sozinho sempre que stage_id muda
-- -- seja pelo funil, pela tela de Leads, por automação ou por disparo.
-- Leads que já existem começam a contar da última atividade (ou da
-- criação). Pode rodar mais de uma vez.
-- ============================================================

do $$
begin
  if to_regclass('public.leads') is null then return; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'stage_changed_at'
  ) then
    alter table public.leads add column stage_changed_at timestamptz;
    update public.leads set stage_changed_at = coalesce(last_activity_at, created_at, now());
    alter table public.leads alter column stage_changed_at set default now();
  end if;
end $$;

create or replace function public.leads_touch_stage_changed_at()
returns trigger
language plpgsql
as $$
begin
  if new.stage_id is distinct from old.stage_id then
    new.stage_changed_at := now();
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.leads') is null then return; end if;
  drop trigger if exists leads_stage_changed_at on public.leads;
  create trigger leads_stage_changed_at
    before update of stage_id on public.leads
    for each row execute function public.leads_touch_stage_changed_at();
end $$;

notify pgrst, 'reload schema';
