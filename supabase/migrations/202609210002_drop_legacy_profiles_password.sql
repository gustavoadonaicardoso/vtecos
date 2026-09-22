-- ============================================================
-- VÓRTICE CRM — Remove coluna legada profiles.password
-- ============================================================
-- Sobra do SQL de setup antigo (README), de antes do login migrar
-- para o Supabase Auth (supabase.auth.signInWithPassword +
-- supabaseAdmin.auth.admin.createUser). Nenhum caminho do código
-- lê ou escreve public.profiles.password hoje — a senha real vive
-- em auth.users, gerenciada pelo próprio Supabase Auth.
--
-- Mantinha um valor em texto puro exposto para quem tivesse acesso
-- de leitura à tabela profiles. Executado em produção em
-- 21/09/2026 junto com a migration 202609210001; este arquivo só
-- registra a mudança no histórico do repositório.
-- ============================================================

alter table public.profiles drop column if exists password;
