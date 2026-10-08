-- ============================================================
-- Leads e etapas do funil ao vivo
-- ============================================================
-- A tela (Leads, Pipeline, Mensagens) escuta mudanças em leads e em
-- pipeline_stages pelo Realtime do Supabase, mas essas tabelas nunca
-- entraram na publicação supabase_realtime: lead novo só aparecia ao
-- recarregar a página. O RLS continua valendo (cada um recebe só a
-- própria empresa). Pode rodar mais de uma vez.
-- ============================================================

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach t in array array['leads', 'pipeline_stages'] loop
    if to_regclass('public.' || t) is not null
      and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
