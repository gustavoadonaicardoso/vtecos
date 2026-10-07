-- Check-up de segurança (outubro/2026).
--
-- integrations_config guarda chaves de API das empresas (Meta, Twilio,
-- Gemini, Asaas...). Até aqui, o administrador de cada empresa conseguia ler
-- essas chaves direto do navegador (policy "tenant admins only"). Nenhuma
-- tela usa esse acesso: tudo passa pelas rotas do servidor, que mascaram os
-- segredos. Agora a tabela é só do servidor (service role), como
-- social_accounts e fin_*.

do $$
declare
  pol record;
begin
  if to_regclass('public.integrations_config') is null then return; end if;

  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'integrations_config' loop
    execute format('drop policy %I on public.integrations_config', pol.policyname);
  end loop;

  alter table public.integrations_config enable row level security;
  revoke all on public.integrations_config from anon;
  revoke all on public.integrations_config from authenticated;
end;
$$;
