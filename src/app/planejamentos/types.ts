import type { Node, Edge, Viewport } from '@xyflow/react';

/**
 * Tipos de nó do canvas. "traffic"/"page"/"action" usam ícone (lucide ou
 * react-icons/si) ou uma imagem enviada pelo usuário; "note" é texto livre.
 */
export type PlanningNodeKind = 'traffic' | 'page' | 'action' | 'note' | 'image';

export interface PlanningNodeData {
  kind: PlanningNodeKind;
  label: string;
  /** Chave de um ícone conhecido (ex.: "meta", "google-ads", "form") -- ver elements.ts */
  iconKey?: string;
  /** URL de uma imagem enviada pelo usuário (logo customizado, print, etc.) */
  imageUrl?: string;
  color?: string;
  [key: string]: unknown;
}

export type PlanningNode = Node<PlanningNodeData>;

export interface PlanningCanvasData {
  nodes: PlanningNode[];
  edges: Edge[];
  viewport: Viewport;
}

export const EMPTY_CANVAS_DATA: PlanningCanvasData = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};

export interface PlanningBoard {
  id: string;
  name: string;
  description: string;
  project_id: string | null;
  /** Preenchido pela API a partir do join com action_plans, só leitura. */
  project_name?: string | null;
  canvas_data: PlanningCanvasData;
  thumbnail_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanningElementDef {
  kind: PlanningNodeKind;
  iconKey: string;
  label: string;
  category: 'trafico' | 'paginas' | 'acoes' | 'nota' | 'midia';
  /** Ícone vem do pacote react-icons/si (logo de marca) em vez do lucide-react */
  brandIcon?: boolean;
  color?: string;
}
