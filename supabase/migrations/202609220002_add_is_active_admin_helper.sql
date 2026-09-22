-- ============================================================
-- VÓRTICE CRM — Função auxiliar is_active_admin()
-- ============================================================
-- Centraliza a checagem "usuário logado é ADMIN ativo?" numa única
-- função, para não repetir o mesmo EXISTS em cada policy restrita a
-- admin. SECURITY DEFINER + search_path fixo evitam depender da
-- policy de SELECT em profiles e evitam search_path hijacking.
--
-- Não muda quem tem acesso hoje — só reorganiza o SQL da policy
-- criada em 202609220001.
-- ============================================================

create or replace function public.is_active_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'ADMIN'
      and profiles.status = 'ACTIVE'
  );
$$;

drop policy if exists "admins manage integrations" on public.integrations_config;

create policy "admins manage integrations" on public.integrations_config
  for all to authenticated
  using (public.is_active_admin())
  with check (public.is_active_admin());
