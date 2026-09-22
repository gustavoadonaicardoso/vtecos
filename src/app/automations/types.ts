import type { LucideIcon } from "lucide-react";

export type ChannelId = "whatsapp" | "instagram" | "messenger" | "email" | "webhook";
export type ProjectStatus = "draft" | "active" | "paused";
export type PortName = "default" | "yes" | "no";
export type NodeType =
  | "trigger-message"
  | "trigger-lead"
  | "trigger-webhook"
  | "send-message"
  | "send-media"
  | "question"
  | "condition"
  | "delay"
  | "update-lead"
  | "tag-lead"
  | "webhook";

export type NodeConfig = {
  channel?: ChannelId;
  message?: string;
  mediaUrl?: string;
  question?: string;
  variable?: string;
  triggerEvent?: string;
  waitMinutes?: number;
  conditionField?: string;
  conditionOperator?: string;
  conditionValue?: string;
  field?: string;
  fieldValue?: string;
  tag?: string;
  url?: string;
  method?: string;
};

export interface AutomationNode {
  id: string;
  type: NodeType;
  category: string;
  label: string;
  content: string;
  x: number;
  y: number;
  config: NodeConfig;
}

export interface Connection {
  id: string;
  fromId: string;
  toId: string;
  fromPort: PortName;
}

export interface AutomationVariable {
  id: string;
  name: string;
  value: string;
  description: string;
}

export interface AutomationProject {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  channels: ChannelId[];
  variables: AutomationVariable[];
  nodes: AutomationNode[];
  connections: Connection[];
  updatedAt: string;
}

export interface NodeDefinition {
  type: NodeType;
  category: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  color: string;
  defaultContent: string;
  defaultConfig: NodeConfig;
}

export interface ChannelDefinition {
  id: ChannelId;
  label: string;
  icon: LucideIcon;
  color: string;
}
