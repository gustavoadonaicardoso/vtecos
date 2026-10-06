-- ============================================================
-- Disparos: colunas antigas que travavam a criação de campanhas
-- ============================================================
-- Bancos criados antes da v2 tinham colunas obrigatórias que o envio
-- novo não preenche na hora de criar a campanha (ex.: rendered_message,
-- que agora é gravada só quando a mensagem sai). Resultado:
--   null value in column "rendered_message" of relation "blast_contacts"
--   violates not-null constraint
-- Aqui tiramos o "obrigatório" dessas colunas antigas sem valor padrão.
-- As chaves (id, empresa, campanha) e o nome da campanha continuam
-- obrigatórios. Pode rodar mais de uma vez.
-- ============================================================

do $$
declare
  col record;
begin
  for col in
    select c.table_name, c.column_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name in ('blast_campaigns', 'blast_contacts')
      and c.is_nullable = 'NO'
      and c.column_default is null
      and c.column_name not in ('id', 'tenant_id', 'campaign_id', 'name')
  loop
    execute format('alter table public.%I alter column %I drop not null', col.table_name, col.column_name);
    raise notice 'Coluna %.% deixou de ser obrigatória', col.table_name, col.column_name;
  end loop;
end $$;
