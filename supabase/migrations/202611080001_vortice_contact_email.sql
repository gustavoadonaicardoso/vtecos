-- ============================================================
-- E-mail de contato da Vórtice: contato@vorticetecnologia.tech
-- ============================================================
-- Rode depois de 202611070001_signup_email_codes.sql.
--
-- Deixa o cadastro da empresa da plataforma (Configurações > Empresa)
-- igual ao contato mostrado no sistema (src/lib/contact.ts).
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

update public.tenants
   set contact_email = 'contato@vorticetecnologia.tech'
 where is_platform = true
   and coalesce(contact_email, '') <> 'contato@vorticetecnologia.tech';
