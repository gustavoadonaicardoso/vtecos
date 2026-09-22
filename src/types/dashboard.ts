// ─── KPI — Dashboard Individual ───────────────────────────────

export interface KPIItem {
  label: string;
  value: string;
  trend: string;
  trendPositive?: boolean;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  color: string;
}
