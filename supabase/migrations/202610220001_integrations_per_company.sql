-- ============================================================
-- Integrações por empresa (Discador, IA, WhatsApp pelo Facebook)
-- ============================================================
-- As contas de cada empresa ficam em integrations_config (uma linha
-- por empresa e provedor: "twilio", "ai", "whatsapp_meta"...). A tela
-- de Integrações grava a data da última alteração; bancos antigos não
-- tinham a coluna. Pode rodar mais de uma vez.
-- ============================================================

alter table public.integrations_config add column if not exists updated_at timestamptz not null default now();

-- Uma configuração por empresa e provedor (o salvar usa "upsert").
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'integrations_config' and indexdef ilike '%(tenant_id, provider)%' and indexdef ilike '%unique%'
  ) then
    -- Duplicadas antigas: fica a mais recente.
    delete from public.integrations_config a
      using public.integrations_config b
      where a.tenant_id = b.tenant_id and a.provider = b.provider and a.ctid < b.ctid;
    create unique index integrations_config_tenant_provider_key on public.integrations_config (tenant_id, provider);
  end if;
end $$;

notify pgrst, 'reload schema';
