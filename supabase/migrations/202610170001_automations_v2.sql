-- ============================================================
-- Automações v2: gatilhos de tempo, webhook de entrada e arquivos
-- ============================================================
-- Rode depois de 202610090001_automations.sql.
--
-- automation_flows:
--   webhook_token -> endereço secreto do gatilho "Chamada de outro
--                    sistema" (POST /api/automations/hooks/<token>);
--   last_fired_at -> último horário em que o gatilho "Data e hora
--                    marcadas" disparou (garante um disparo por horário);
--   state         -> memória do fluxo (ex.: de quem é a vez no rodízio
--                    do bloco "Distribuir lead").
-- Bucket automation-media: arquivos enviados pelo bloco "Enviar arquivo"
-- (público: o WhatsApp baixa o arquivo pelo link).
-- Pode rodar mais de uma vez.
-- ============================================================

alter table public.automation_flows
  add column if not exists webhook_token text,
  add column if not exists last_fired_at timestamptz,
  add column if not exists state jsonb not null default '{}'::jsonb;

create unique index if not exists automation_flows_webhook_token_idx on public.automation_flows (webhook_token) where webhook_token is not null;
-- O agendador procura os fluxos ativos por tipo de gatilho, de todas as empresas.
create index if not exists automation_flows_event_idx on public.automation_flows (status, trigger_event);
-- Histórico de execuções por lead (não repetir, limite de vezes).
create index if not exists automation_runs_flow_lead_idx on public.automation_runs (flow_id, lead_id, started_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'automation-media',
  'automation-media',
  true,
  16777216,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/3gpp',
    'audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/amr',
    'application/pdf', 'text/plain', 'text/csv',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip'
  ]
)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
