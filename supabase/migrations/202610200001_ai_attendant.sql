-- ============================================================
-- Automações: Atendente com IA
-- ============================================================
-- Duas marcas no lead para a IA saber quando ficar quieta:
--   ai_paused_until  -> pausada pela equipe (botão em Mensagens) ou
--                       porque o cliente pediu uma pessoa;
--   human_replied_at -> última vez que alguém da equipe respondeu
--                       (pelo sistema ou pelo celular conectado).
-- Pode rodar mais de uma vez.
-- ============================================================

alter table public.leads
  add column if not exists ai_paused_until timestamptz,
  add column if not exists human_replied_at timestamptz;
