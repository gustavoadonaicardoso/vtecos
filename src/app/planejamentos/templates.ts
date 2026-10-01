import type { PlanningCanvasData, PlanningNode } from './types';
import type { Edge } from '@xyflow/react';

function node(id: string, x: number, y: number, data: PlanningNode['data'], type: 'funnel' | 'sticky' = 'funnel'): PlanningNode {
  return { id, type, position: { x, y }, data };
}

function edge(id: string, source: string, target: string): Edge {
  return { id, source, target, animated: false };
}

export interface PlanningTemplate {
  id: string;
  name: string;
  description: string;
  canvas_data: PlanningCanvasData;
}

const TRAFEGO_PAGO: PlanningCanvasData = {
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [
    node('n1', 40, 140, { kind: 'traffic', label: 'Meta / Facebook', iconKey: 'meta', color: '#1877F2' }),
    node('n2', 340, 140, { kind: 'page', label: 'Página de Captura', iconKey: 'landing-page', color: '#3b82f6' }),
    node('n3', 640, 140, { kind: 'page', label: 'Checkout', iconKey: 'checkout', color: '#f59e0b' }),
    node('n4', 940, 140, { kind: 'page', label: 'Página de Obrigado', iconKey: 'obrigado', color: '#10b981' }),
  ],
  edges: [edge('e1', 'n1', 'n2'), edge('e2', 'n2', 'n3'), edge('e3', 'n3', 'n4')],
};

const NUTRICAO_UPSELL: PlanningCanvasData = {
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [
    node('n1', 40, 140, { kind: 'traffic', label: 'Instagram', iconKey: 'instagram', color: '#E4405F' }),
    node('n2', 340, 140, { kind: 'page', label: 'Página de Captura', iconKey: 'landing-page', color: '#3b82f6' }),
    node('n3', 640, 140, { kind: 'traffic', label: 'E-mail', iconKey: 'email', color: '#64748b' }),
    node('n4', 940, 140, { kind: 'page', label: 'Upsell / Oferta', iconKey: 'upsell', color: '#ec4899' }),
    node('n5', 1240, 140, { kind: 'page', label: 'Página de Obrigado', iconKey: 'obrigado', color: '#10b981' }),
    node('note1', 640, 320, { kind: 'note', label: 'Enviar 3 e-mails de nutrição antes de mostrar a oferta', iconKey: 'sticky-note' }, 'sticky'),
  ],
  edges: [edge('e1', 'n1', 'n2'), edge('e2', 'n2', 'n3'), edge('e3', 'n3', 'n4'), edge('e4', 'n4', 'n5')],
};

export const PLANNING_TEMPLATES: PlanningTemplate[] = [
  {
    id: 'trafego-pago',
    name: 'Tráfego pago → Venda',
    description: 'Anúncio direto para uma página de captura, checkout e página de obrigado.',
    canvas_data: TRAFEGO_PAGO,
  },
  {
    id: 'nutricao-upsell',
    name: 'Captura + nutrição + upsell',
    description: 'Captura o lead, nutre por e-mail e oferece um upsell antes de fechar.',
    canvas_data: NUTRICAO_UPSELL,
  },
];
