-- ============================================================
-- VÓRTICE CRM — "Visto por último" dos usuários
-- ============================================================
-- O status Online em tempo real vem do Supabase Realtime (Presence).
-- Esta coluna guarda a última vez que o usuário esteve conectado,
-- para mostrar "Visto há 5 min" quando ele não está online.
-- Atualizada só pelo servidor (/api/presence), a cada minuto enquanto
-- o sistema está aberto e ao fechar a aba/sair.
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

alter table public.profiles add column if not exists last_seen_at timestamptz;

notify pgrst, 'reload schema';
