-- ============================================================
-- Configurações: dados da empresa e fotos de perfil
-- ============================================================
-- 1. A empresa (tenant) guarda telefone, site e endereço, editados pelo
--    administrador dela em Configurações > Empresa (antes ficavam só no
--    navegador de quem preencheu).
-- 2. Bucket público "avatars" para as fotos de perfil. Antes a foto ia
--    em base64 dentro de profiles.avatar_url (até 2 MB por pessoa), e
--    toda lista de equipe/chat carregava essas imagens inteiras.
--    Upload só pelo servidor (service role), em <tenant_id>/<arquivo>.
-- Pode rodar mais de uma vez.
-- ============================================================

alter table public.tenants add column if not exists phone text;
alter table public.tenants add column if not exists website text;
alter table public.tenants add column if not exists address text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/jpeg'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
