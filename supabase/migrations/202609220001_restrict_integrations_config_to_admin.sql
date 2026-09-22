-- ============================================================
-- VÓRTICE CRM — Restringe integrations_config a administradores
-- ============================================================
-- integrations_config guarda credenciais de integrações (tokens da
-- Meta, futuras chaves de outros provedores) em uma coluna JSONB.
-- A migration 202609210001 deu acesso total a qualquer usuário
-- `authenticated` — correto para destravar a tabela, mas amplo
-- demais para dados sensíveis. Esta migration troca por uma policy
-- que só libera para perfis com role = 'ADMIN' e status = 'ACTIVE'.
--
-- Idempotente: pode rodar mais de uma vez sem erro.
-- ============================================================

drop policy if exists "authenticated full access" on public.integrations_config;

create policy "admins manage integrations" on public.integrations_config
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'ADMIN'
        and profiles.status = 'ACTIVE'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'ADMIN'
        and profiles.status = 'ACTIVE'
    )
  );
