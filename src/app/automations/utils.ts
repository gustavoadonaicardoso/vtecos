import { getNodeDefinition, STORAGE_KEY } from "./constants";
import type { AutomationNode, AutomationProject, NodeDefinition } from "./types";

export const makeId = (prefix: string) => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export const createNode = (definition: NodeDefinition, x: number, y: number): AutomationNode => ({
  id: makeId("node"),
  type: definition.type,
  category: definition.category,
  label: definition.label,
  content: definition.defaultContent,
  x,
  y,
  config: { ...definition.defaultConfig },
});

export const createDefaultProject = (): AutomationProject => ({
  id: makeId("project"),
  name: "Novo projeto",
  description: "Configure um fluxo de automação para sua equipe.",
  status: "draft",
  channels: [],
  variables: [
    { id: makeId("variable"), name: "lead.name", value: "{{lead.name}}", description: "Nome do contato" },
    { id: makeId("variable"), name: "lead.phone", value: "{{lead.phone}}", description: "Telefone do contato" },
  ],
  nodes: [createNode(getNodeDefinition("trigger-message"), 140, 180)],
  connections: [],
  updatedAt: new Date().toISOString(),
});

export const readProjects = (): AutomationProject[] => {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((project): project is AutomationProject => {
      if (!project || typeof project !== "object") return false;
      const item = project as Partial<AutomationProject>;
      return typeof item.id === "string" && typeof item.name === "string" && Array.isArray(item.nodes) && Array.isArray(item.connections);
    });
  } catch {
    return [];
  }
};
