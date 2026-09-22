/**
 * ============================================================
 * VÓRTICE CRM — Tipos Centralizados
 * ============================================================
 * Barrel de re-exports: o conteúdo real vive nos arquivos por
 * domínio abaixo. Continue importando de '@/types' normalmente —
 * este arquivo só existe para não obrigar todo o projeto a saber
 * de qual arquivo específico cada tipo vem.
 *
 * Nunca defina tipos diretamente nos components ou contexts.
 * ============================================================
 */

export * from './auth';
export * from './leads';
export * from './notifications';
export * from './banners';
export * from './dashboard';
export * from './audit';
export * from './whatsapp';
export * from './branding';
export * from './common';
