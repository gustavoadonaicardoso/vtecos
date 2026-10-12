-- ============================================================
-- Leads: achar o lead pelo telefone em qualquer formato
-- ============================================================
-- Rode depois de 202611050001_lead_extra_fields.sql.
--
-- Problema: o lead cadastrado à mão com máscara, ex. "(11) 98888-7777",
-- não era achado quando a pessoa mandava mensagem no WhatsApp
-- ("5511988887777"): a busca comparava o texto, e o hífen no meio
-- atrapalhava. Resultado: um lead novo (duplicado) para o mesmo número.
--
-- phone_key: os 8 últimos dígitos do telefone (sem DDI, DDD, nono dígito,
-- espaços, parênteses ou hífen), calculado pelo próprio banco. A busca
-- passa a comparar só os números.
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

alter table public.leads
  add column if not exists phone_key text
  generated always as (nullif(right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 8), '')) stored;

create index if not exists leads_tenant_phone_key_idx on public.leads (tenant_id, phone_key);
