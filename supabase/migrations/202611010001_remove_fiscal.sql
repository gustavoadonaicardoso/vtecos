-- ============================================================
-- Remove o módulo Notas Fiscais
-- ============================================================
-- Rode depois de 202610310001_plans_modules_limits.sql.
-- O módulo saiu do sistema (telas, rotas e catálogo). Aqui só se tira a
-- chave "fiscal" dos planos e dos banners que a tinham marcada. O sistema
-- já ignora a chave mesmo sem esta migration.
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

update public.plans
set modules = array_remove(modules, 'fiscal'), updated_at = now()
where 'fiscal' = any(modules);

update public.platform_banners
set target_modules = array_remove(target_modules, 'fiscal'), updated_at = now()
where 'fiscal' = any(target_modules);
