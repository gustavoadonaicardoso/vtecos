-- ============================================================
-- Chat interno: bucket "files" para anexos e foto de grupo
-- ============================================================
-- Rode depois de 202611020001_quick_reply_shortcuts.sql.
-- O Chat interno envia anexos e fotos de grupo para o bucket "files",
-- mas nenhuma migration o criava: sem ele, o envio de arquivo dava
-- "Erro ao enviar arquivo". As regras de quem pode gravar e ler já
-- existiam (202610050001): cada empresa só grava e lê na própria pasta
-- <tenant_id>/... . Aqui elas são recriadas do mesmo jeito.
-- Público como os outros buckets de mídia: o link do anexo abre direto
-- (o nome do arquivo é aleatório). Limite de 20 MB por arquivo.
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', true, 20971520)
on conflict (id) do update set public = true, file_size_limit = 20971520;

do $$
begin
  if to_regclass('storage.objects') is null or to_regprocedure('public.current_tenant_id()') is null then return; end if;
  drop policy if exists "tenant folder upload" on storage.objects;
  create policy "tenant folder upload" on storage.objects for insert to authenticated
    with check (bucket_id = 'files' and split_part(name, '/', 1) = (select public.current_tenant_id())::text);
  drop policy if exists "tenant folder read" on storage.objects;
  create policy "tenant folder read" on storage.objects for select to authenticated
    using (bucket_id = 'files' and split_part(name, '/', 1) = (select public.current_tenant_id())::text);
end $$;
