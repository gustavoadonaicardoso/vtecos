-- ============================================================
-- Relatórios com números reais
-- ============================================================
-- 1) chat_messages.origin: quem mandou cada mensagem da empresa
--    ('team' = equipe pelo sistema, 'phone' = celular conectado,
--    'ai' = IA, 'automation' = automação, 'campaign' = disparo,
--    'scheduled' = mensagem agendada). Mensagens do cliente ficam sem
--    origem (sent_by_me = false). Mensagens antigas: com sent_by =
--    equipe; sem sent_by = automação.
-- 2) report_response_times / report_overview: o servidor calcula os
--    relatórios no banco (sem baixar milhares de linhas). Só o service
--    role executa; a rota /api/reports passa a empresa da sessão.
-- Pode rodar mais de uma vez.
-- ============================================================

alter table public.chat_messages add column if not exists origin text;
create index if not exists chat_messages_tenant_created_idx on public.chat_messages (tenant_id, created_at);
create index if not exists leads_tenant_created_idx on public.leads (tenant_id, created_at);
create index if not exists automation_runs_tenant_started_idx on public.automation_runs (tenant_id, started_at);

-- Quem respondeu: equipe, celular, IA, automação, campanha ou agendada.
create or replace function public.report_message_kind(p_sent_by_me boolean, p_origin text, p_sent_by uuid)
returns text
language sql
immutable
as $$
  select case
    when not coalesce(p_sent_by_me, false) then 'customer'
    when p_origin is not null then p_origin
    when p_sent_by is not null then 'team'
    else 'automation'
  end
$$;

-- ── Tempo de resposta ────────────────────────────────────────
-- Cada vez que o cliente volta a falar (mensagem dele depois de uma da
-- empresa, ou a primeira) abre uma "vez" de atendimento. Mede quanto
-- demorou a primeira resposta (qualquer uma, menos disparo) e a primeira
-- resposta de uma pessoa (equipe pelo sistema ou celular). Tempo corrido,
-- respostas até 7 dias depois.
create or replace function public.report_response_times(p_tenant uuid, p_from timestamptz, p_to timestamptz, p_user uuid default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  with scope as (
    select id::text as lid from leads
    where tenant_id = p_tenant and (p_user is null or assigned_to = p_user)
  ),
  msgs as (
    select
      m.lead_id::text as lid,
      m.created_at,
      m.sent_by_me,
      m.sent_by,
      report_message_kind(m.sent_by_me, m.origin, m.sent_by) as kind
    from chat_messages m
    where m.tenant_id = p_tenant
      and m.lead_id is not null
      and m.created_at >= p_from - interval '2 days'
      and m.created_at < p_to + interval '7 days'
      and (p_user is null or m.lead_id::text in (select lid from scope))
  ),
  ordered as (
    select
      *,
      lag(kind) over w as prev_kind,
      min(case when kind not in ('customer', 'campaign') then created_at end)
        over (partition by lid order by created_at rows between 1 following and unbounded following) as any_reply_at,
      min(case when kind in ('team', 'phone') then created_at end)
        over (partition by lid order by created_at rows between 1 following and unbounded following) as human_reply_at
    from msgs
    window w as (partition by lid order by created_at)
  ),
  turns as (
    select
      o.lid,
      o.created_at,
      case when o.any_reply_at <= o.created_at + interval '7 days' then extract(epoch from o.any_reply_at - o.created_at) / 60 end as any_min,
      case when o.human_reply_at <= o.created_at + interval '7 days' then extract(epoch from o.human_reply_at - o.created_at) / 60 end as human_min,
      o.human_reply_at
    from ordered o
    where o.kind = 'customer'
      and (o.prev_kind is null or o.prev_kind <> 'customer')
      and o.created_at >= p_from
      and o.created_at < p_to
  ),
  responders as (
    select t.human_min, (
      select r.sent_by from msgs r
      where r.lid = t.lid and r.created_at = t.human_reply_at and r.kind = 'team'
      limit 1
    ) as user_id
    from turns t
    where t.human_reply_at is not null and t.human_min is not null
  )
  select jsonb_build_object(
    'turns', (select count(*) from turns),
    'answered', (select count(*) from turns where any_min is not null),
    'answered_by_human', (select count(*) from turns where human_min is not null),
    'median_any', (select percentile_cont(0.5) within group (order by any_min) from turns where any_min is not null),
    'median_human', (select percentile_cont(0.5) within group (order by human_min) from turns where human_min is not null),
    'within_5', (select count(*) from turns where any_min <= 5),
    'by_user', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', user_id, 'count', n, 'median', med))
      from (
        select user_id, count(*) as n, percentile_cont(0.5) within group (order by human_min) as med
        from responders where user_id is not null group by user_id
      ) x
    ), '[]'::jsonb)
  )
$$;

-- ── Relatório completo do período ────────────────────────────
create or replace function public.report_overview(
  p_tenant uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_user uuid default null,
  p_tz text default 'America/Sao_Paulo'
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  prev_from timestamptz := p_from - (p_to - p_from);
  manager boolean := p_user is null;
  result jsonb;
begin
  with scope_leads as (
    select * from leads
    where tenant_id = p_tenant and (p_user is null or assigned_to = p_user)
  ),
  scope_msgs as (
    select
      m.lead_id::text as lid,
      m.created_at,
      m.sent_by,
      report_message_kind(m.sent_by_me, m.origin, m.sent_by) as kind
    from chat_messages m
    where m.tenant_id = p_tenant
      and m.created_at >= prev_from
      and m.created_at < p_to
      and (p_user is null or m.lead_id::text in (select id::text from scope_leads))
  ),
  won as (
    select * from scope_leads where stage_id = 'ganho' and stage_changed_at >= prev_from and stage_changed_at < p_to
  ),
  days as (
    select generate_series((p_from at time zone p_tz)::date, ((p_to - interval '1 second') at time zone p_tz)::date, interval '1 day')::date as d
  )
  select jsonb_build_object(
    'leads', jsonb_build_object(
      'new', (select count(*) from scope_leads where created_at >= p_from and created_at < p_to),
      'new_prev', (select count(*) from scope_leads where created_at >= prev_from and created_at < p_from),
      'open', (select count(*) from scope_leads where stage_id <> 'ganho'),
      'open_value', (select coalesce(sum(value), 0) from scope_leads where stage_id <> 'ganho')
    ),
    'sales', jsonb_build_object(
      'won', (select count(*) from won where stage_changed_at >= p_from),
      'won_prev', (select count(*) from won where stage_changed_at < p_from),
      'revenue', (select coalesce(sum(value), 0) from won where stage_changed_at >= p_from),
      'revenue_prev', (select coalesce(sum(value), 0) from won where stage_changed_at < p_from),
      'cohort_won', (select count(*) from scope_leads where created_at >= p_from and created_at < p_to and stage_id = 'ganho')
    ),
    'messages', jsonb_build_object(
      'received', (select count(*) from scope_msgs where kind = 'customer' and created_at >= p_from),
      'received_prev', (select count(*) from scope_msgs where kind = 'customer' and created_at < p_from),
      'sent', (select count(*) from scope_msgs where kind <> 'customer' and created_at >= p_from),
      'by_kind', coalesce((select jsonb_object_agg(kind, n) from (select kind, count(*) as n from scope_msgs where created_at >= p_from group by kind) k), '{}'::jsonb),
      'conversations', (select count(distinct lid) from scope_msgs where kind = 'customer' and created_at >= p_from),
      'conversations_prev', (select count(distinct lid) from scope_msgs where kind = 'customer' and created_at < p_from)
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', d.d,
        'new_leads', (select count(*) from scope_leads l where (l.created_at at time zone p_tz)::date = d.d and l.created_at >= p_from and l.created_at < p_to),
        'won', (select count(*) from won w where (w.stage_changed_at at time zone p_tz)::date = d.d and w.stage_changed_at >= p_from),
        'revenue', (select coalesce(sum(value), 0) from won w where (w.stage_changed_at at time zone p_tz)::date = d.d and w.stage_changed_at >= p_from),
        'received', (select count(*) from scope_msgs m where m.kind = 'customer' and m.created_at >= p_from and (m.created_at at time zone p_tz)::date = d.d),
        'sent', (select count(*) from scope_msgs m where m.kind <> 'customer' and m.created_at >= p_from and (m.created_at at time zone p_tz)::date = d.d)
      ) order by d.d), '[]'::jsonb)
      from days d
    ),
    'heatmap', (
      select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'hour', hour, 'count', n)), '[]'::jsonb)
      from (
        select extract(dow from created_at at time zone p_tz)::int as dow, extract(hour from created_at at time zone p_tz)::int as hour, count(*) as n
        from scope_msgs where kind = 'customer' and created_at >= p_from
        group by 1, 2
      ) h
    ),
    'sources', (
      select coalesce(jsonb_agg(jsonb_build_object('source', source, 'total', total, 'won', won_count, 'revenue', revenue) order by total desc), '[]'::jsonb)
      from (
        select coalesce(nullif(trim(source), ''), 'Não informado') as source, count(*) as total,
               count(*) filter (where stage_id = 'ganho') as won_count,
               coalesce(sum(value) filter (where stage_id = 'ganho'), 0) as revenue
        from scope_leads where created_at >= p_from and created_at < p_to
        group by 1
      ) s
    ),
    'funnel', (
      select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'color', st.color, 'count', coalesce(c.n, 0), 'value', coalesce(c.v, 0)) order by st.position), '[]'::jsonb)
      from pipeline_stages st
      left join (select stage_id, count(*) as n, coalesce(sum(value), 0) as v from scope_leads group by stage_id) c on c.stage_id = st.id
      where st.tenant_id = p_tenant
    ),
    'waiting', (
      -- Conversas dos últimos 7 dias cuja última mensagem é do cliente;
      -- espera conta da primeira mensagem dele sem resposta.
      with recent as (
        select m.lead_id::text as lid, m.created_at, coalesce(m.sent_by_me, false) as mine
        from chat_messages m
        where m.tenant_id = p_tenant and m.lead_id is not null and m.created_at >= now() - interval '7 days'
      ),
      lead_state as (
        select lid, max(created_at) filter (where mine) as last_out, max(created_at) as last_any
        from recent group by lid
      ),
      pending as (
        select l.id, l.name, l.assigned_to, min(r.created_at) as since
        from lead_state ls
        join recent r on r.lid = ls.lid and not r.mine and r.created_at > coalesce(ls.last_out, '-infinity'::timestamptz)
        join scope_leads l on l.id::text = ls.lid
        where (ls.last_out is null or ls.last_out < ls.last_any) and not coalesce(l.blocked, false)
        group by l.id, l.name, l.assigned_to
      )
      select jsonb_build_object(
        'count', (select count(*) from pending),
        'over_1h', (select count(*) from pending where since < now() - interval '1 hour'),
        'oldest', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'assigned_to', assigned_to, 'since', since) order by since)
                            from (select * from pending order by since limit 8) p), '[]'::jsonb)
      )
    ),
    'responses', report_response_times(p_tenant, p_from, p_to, p_user),
    'responses_prev', report_response_times(p_tenant, prev_from, p_from, p_user),
    'team', case when manager then (
      select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.revenue desc, t.won desc, t.messages desc), '[]'::jsonb)
      from (
        select
          p.id, p.name, p.role,
          (select count(*) from scope_leads l where l.assigned_to = p.id and l.stage_id <> 'ganho') as open_leads,
          (select count(*) from scope_leads l where l.assigned_to = p.id and l.created_at >= p_from and l.created_at < p_to) as new_leads,
          (select count(*) from won w where w.assigned_to = p.id and w.stage_changed_at >= p_from) as won,
          (select coalesce(sum(w.value), 0) from won w where w.assigned_to = p.id and w.stage_changed_at >= p_from) as revenue,
          (select count(*) from scope_msgs m where m.sent_by = p.id and m.kind = 'team' and m.created_at >= p_from) as messages,
          (select count(distinct m.lid) from scope_msgs m where m.sent_by = p.id and m.kind = 'team' and m.created_at >= p_from) as conversations
        from profiles p
        where p.tenant_id = p_tenant and p.status = 'ACTIVE'
      ) t
    ) end,
    'automations', case when manager then (
      with runs as (
        select r.*, f.name as flow_name from automation_runs r left join automation_flows f on f.id = r.flow_id
        where r.tenant_id = p_tenant and r.started_at >= p_from and r.started_at < p_to
      ),
      ai as (
        select
          coalesce((context -> 'aiChat' ->> 'turns')::int, 0) as turns,
          coalesce((context -> 'aiChat' ->> 'handedOff')::boolean, false)
            or exists (select 1 from jsonb_array_elements(coalesce(steps, '[]'::jsonb)) s where s ->> 'detail' like 'Passou para a equipe%') as handed
        from runs where context ? 'aiChat'
      )
      select jsonb_build_object(
        'runs', (select count(*) from runs),
        'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) as n from runs group by status) s), '{}'::jsonb),
        'flows', coalesce((
          select jsonb_agg(jsonb_build_object('id', flow_id, 'name', flow_name, 'runs', n, 'failed', failed) order by n desc)
          from (select flow_id, max(flow_name) as flow_name, count(*) as n, count(*) filter (where status = 'failed') as failed from runs group by flow_id order by count(*) desc limit 8) f
        ), '[]'::jsonb),
        'ai', jsonb_build_object(
          'conversations', (select count(*) from ai),
          'replies', (select coalesce(sum(turns), 0) from ai),
          'handoffs', (select count(*) from ai where handed),
          'resolved', (select count(*) from ai where turns > 0 and not handed)
        )
      )
    ) end,
    'campaigns', case when manager then (
      with c as (
        select * from blast_campaigns
        where tenant_id = p_tenant and status <> 'draft' and coalesce(started_at, created_at) >= p_from and coalesce(started_at, created_at) < p_to
      )
      select jsonb_build_object(
        'count', (select count(*) from c),
        'sent', (select coalesce(sum(sent_count), 0) from c),
        'failed', (select coalesce(sum(failed_count), 0) from c),
        'replied', (select coalesce(sum(replied_count), 0) from c),
        'optouts', (select coalesce(sum(optout_count), 0) from c),
        'top', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'status', status, 'sent', sent_count, 'replied', replied_count, 'failed', failed_count) order by sent_count desc)
                         from (select * from c order by sent_count desc limit 6) t), '[]'::jsonb)
      )
    ) end,
    'calls', (
      select jsonb_build_object('count', count(*), 'avg_duration', coalesce(avg(duration) filter (where duration > 0), 0))
      from call_logs
      where tenant_id = p_tenant and created_at >= p_from and created_at < p_to and (p_user is null or user_id = p_user)
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.report_message_kind(boolean, text, uuid) from public;
revoke all on function public.report_response_times(uuid, timestamptz, timestamptz, uuid) from public;
revoke all on function public.report_overview(uuid, timestamptz, timestamptz, uuid, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.report_message_kind(boolean, text, uuid) from anon, authenticated;
    revoke all on function public.report_response_times(uuid, timestamptz, timestamptz, uuid) from anon, authenticated;
    revoke all on function public.report_overview(uuid, timestamptz, timestamptz, uuid, text) from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.report_message_kind(boolean, text, uuid) to service_role;
    grant execute on function public.report_response_times(uuid, timestamptz, timestamptz, uuid) to service_role;
    grant execute on function public.report_overview(uuid, timestamptz, timestamptz, uuid, text) to service_role;
  end if;
end $$;

notify pgrst, 'reload schema';
