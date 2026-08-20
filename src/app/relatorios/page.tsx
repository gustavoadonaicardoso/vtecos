"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutGrid, TrendingUp, TrendingDown, RefreshCw,
  Calendar, MapPin, CreditCard, Activity,
  TableProperties, BarChart2, Minus, ChevronLeft, ChevronRight
} from "lucide-react";
import styles from "./relatorios.module.css";

// ─── CONSTANTS ─────────────────────────────────────────────────────────────

const UNITS = ["Alphaville", "Barueri", "Cotia", "Granja Viana", "Itapevi", "Jandira", "Osasco", "Carapicuíba"];
const DAYS  = Array.from({ length: 31 }, (_, i) => i + 1);
const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const COLORS_CHART = ["#6366f1","#8b5cf6","#ec4899","#14b8a6","#f59e0b","#10b981","#3b82f6","#f97316"];

// ─── MOCK DATA GENERATOR ────────────────────────────────────────────────────

function rnd(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildSalesGrid() {
  return UNITS.map((unit) => ({
    unit,
    days: DAYS.map(() => (Math.random() > 0.3 ? rnd(0, 12) : 0)),
  }));
}

function buildUnfilGrid() {
  return UNITS.map((unit) => ({
    unit,
    days: DAYS.map(() => (Math.random() > 0.55 ? rnd(0, 5) : 0)),
  }));
}

function buildDiscounts() {
  return UNITS.map((unit) => ({ unit, value: rnd(200, 3500) }));
}

function buildQuality() {
  return UNITS.map((unit) => ({ unit, pct: rnd(62, 99) }));
}

function buildBalance(sales: ReturnType<typeof buildSalesGrid>, unfil: ReturnType<typeof buildUnfilGrid>) {
  return UNITS.map((unit, i) => {
    const s = sales[i].days.reduce((a, b) => a + b, 0);
    const d = unfil[i].days.reduce((a, b) => a + b, 0);
    return { unit, sales: s, unfil: d, saldo: s - d };
  });
}

function buildQIA() {
  return UNITS.map((unit) => ({ unit, value: rnd(30, 220) }));
}

function buildApp() {
  return UNITS.map((unit) => ({ unit, sim: rnd(10, 90), nao: rnd(5, 40) }));
}

function buildPayment() {
  return UNITS.map((unit) => ({
    unit: unit.slice(0, 7),
    credito: rnd(15, 80),
    debito: rnd(10, 50),
    boleto: rnd(5, 35),
    energia: rnd(2, 20),
  }));
}

// ─── TOOLTIP ────────────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className={styles.customTooltip}>
        <p className={styles.customTooltipLabel}>{label}</p>
        {payload.map((e: any, i: number) => (
          <p key={i} className={styles.customTooltipItem} style={{ color: e.color || "#fff" }}>
            {e.name}: {e.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// ─── SECTION HEADER ─────────────────────────────────────────────────────────

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: React.ReactNode }) {
  return (
    <div className={styles.sectionHeader}>
      <div className={styles.sectionIcon}>{icon}</div>
      <div>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {subtitle && <p className={styles.sectionSubtitle}>{subtitle}</p>}
      </div>
      <div className={styles.sectionDivider} />
    </div>
  );
}

// ─── DAILY GRID TABLE ────────────────────────────────────────────────────────

function DailyTable({
  title, rows, colorClass,
}: {
  title: string;
  rows: { unit: string; days: number[] }[];
  colorClass?: string;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const totals = DAYS.map((_, di) => rows.reduce((s, r) => s + r.days[di], 0));
  const grandTotal = totals.reduce((a, b) => a + b, 0);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const amount = direction === 'left' ? -350 : 350;
      scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
          <TableProperties size={14} color="#818cf8" />
          <h3 className={styles.cardTitle}>{title}</h3>
        </div>
        <div className={styles.tableNav}>
          <button 
            onClick={() => scroll('left')} 
            className={styles.navBtn}
            title="Rolar para esquerda"
          >
            <ChevronLeft size={16} />
          </button>
          <button 
            onClick={() => scroll('right')} 
            className={styles.navBtn}
            title="Rolar para direita"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className={styles.tableWrapper} ref={scrollRef}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th>Unidade</th>
              {DAYS.map((d) => <th key={d}>{d}</th>)}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rowTotal = row.days.reduce((a, b) => a + b, 0);
              return (
                <tr key={row.unit}>
                  <td>{row.unit}</td>
                  {row.days.map((v, di) => (
                    <td key={di}>
                      {v === 0 ? (
                        <span className={styles.cellEmpty}>–</span>
                      ) : (
                        <span className={v >= 8 ? styles.cellHighlight : v >= 4 ? styles.cellWarning : ""}>
                          {v}
                        </span>
                      )}
                    </td>
                  ))}
                  <td><strong>{rowTotal}</strong></td>
                </tr>
              );
            })}
            <tr className={styles.totalsRow}>
              <td>Total</td>
              {totals.map((t, i) => <td key={i}>{t || <span className={styles.cellEmpty}>–</span>}</td>)}
              <td>{grandTotal}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── DISCOUNT TABLE ──────────────────────────────────────────────────────────

function DiscountTable({ data }: { data: { unit: string; value: number }[] }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <Minus size={14} color="#818cf8" />
        <h3 className={styles.cardTitle}>Descontos nas Mensalidades</h3>
      </div>
      <div className={styles.tableWrapper}>
        <table className={styles.smallTable}>
          <thead><tr><th>Unidade</th><th>R$ Desconto</th></tr></thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.unit}>
                <td>{r.unit}</td>
                <td>
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(r.value)}
                </td>
              </tr>
            ))}
            <tr className={styles.totalsRow}>
              <td>Total</td>
              <td>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── QUALITY TABLE ───────────────────────────────────────────────────────────

function QualityTable({ data }: { data: { unit: string; pct: number }[] }) {
  const avg = Math.round(data.reduce((a, b) => a + b.pct, 0) / data.length);
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <Activity size={14} color="#818cf8" />
        <h3 className={styles.cardTitle}>Qualidade Cadastral</h3>
      </div>
      <div className={styles.tableWrapper}>
        <table className={styles.smallTable}>
          <thead><tr><th>Unidade</th><th>%</th></tr></thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.unit}>
                <td>{r.unit}</td>
                <td>
                  <div className={styles.percentBar}>
                    <div className={styles.percentTrack}>
                      <div className={styles.percentFill} style={{ width: `${r.pct}%` }} />
                    </div>
                    <span className={styles.percentLabel}>{r.pct}%</span>
                  </div>
                </td>
              </tr>
            ))}
            <tr className={styles.totalsRow}>
              <td>Média</td>
              <td><span className={styles.percentLabel}>{avg}%</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── BALANCE TABLE ───────────────────────────────────────────────────────────

function BalanceTable({ data }: { data: { unit: string; sales: number; unfil: number; saldo: number }[] }) {
  const totS = data.reduce((a, b) => a + b.sales, 0);
  const totU = data.reduce((a, b) => a + b.unfil, 0);
  const totSaldo = totS - totU;
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <TrendingUp size={14} color="#818cf8" />
        <h3 className={styles.cardTitle}>Saldo Final</h3>
      </div>
      <div className={styles.tableWrapper}>
        <table className={styles.smallTable}>
          <thead>
            <tr>
              <th>Unidade</th>
              <th>Vendas</th>
              <th>Desfiliação</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.unit}>
                <td>{r.unit}</td>
                <td><span className={styles.positive}>{r.sales}</span></td>
                <td><span className={styles.negative}>{r.unfil}</span></td>
                <td>
                  <span className={r.saldo > 0 ? styles.positive : r.saldo < 0 ? styles.negative : styles.neutral}>
                    {r.saldo > 0 ? "+" : ""}{r.saldo}
                  </span>
                </td>
              </tr>
            ))}
            <tr className={styles.totalsRow}>
              <td>Total</td>
              <td><span className={styles.positive}>{totS}</span></td>
              <td><span className={styles.negative}>{totU}</span></td>
              <td>
                <span className={totSaldo >= 0 ? styles.positive : styles.negative}>
                  {totSaldo > 0 ? "+" : ""}{totSaldo}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const now = new Date();
  const [filterDay,  setFilterDay]  = useState("Todos");
  const [filterUnit, setFilterUnit] = useState("Todas");
  const [filterPay,  setFilterPay]  = useState("Todas");
  const [filterMonth,setFilterMonth]= useState(String(now.getMonth() + 1));
  const [filterYear, setFilterYear] = useState(String(now.getFullYear()));
  const [lastUpdate, setLastUpdate] = useState("");
  const [currentTime, setCurrentTime] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // data state
  const [salesGrid,   setSalesGrid]   = useState(() => buildSalesGrid());
  const [unfilGrid,   setUnfilGrid]   = useState(() => buildUnfilGrid());
  const [discounts,   setDiscounts]   = useState(() => buildDiscounts());
  const [quality,     setQuality]     = useState(() => buildQuality());
  const [qiaData,     setQiaData]     = useState(() => buildQIA());
  const [appData,     setAppData]     = useState(() => buildApp());
  const [paymentData, setPaymentData] = useState(() => buildPayment());

  const balance = buildBalance(salesGrid, unfilGrid);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setSalesGrid(buildSalesGrid());
      setUnfilGrid(buildUnfilGrid());
      setDiscounts(buildDiscounts());
      setQuality(buildQuality());
      setQiaData(buildQIA());
      setAppData(buildApp());
      setPaymentData(buildPayment());
      setLastUpdate(new Date().toLocaleTimeString("pt-BR"));
      setRefreshing(false);
    }, 700);
  }, []);

  // auto-refresh every 60s
  useEffect(() => {
    const id = setInterval(refresh, 60000);
    return () => clearInterval(id);
  }, [refresh]);

  // Initialize time on client mount
  useEffect(() => {
    setLastUpdate(new Date().toLocaleTimeString("pt-BR"));
    setCurrentTime(new Date().toLocaleTimeString("pt-BR"));
    
    const id = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString("pt-BR"));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={styles.pageWrapper}>

      {/* ── FILTER BAR ── */}
      <motion.div 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={styles.filterBar}
      >
        <div className={styles.filterBarLeft}>

          {/* Day */}
          <div className={styles.filterGroup}>
            <Calendar size={13} color="#6366f1" />
            <span className={styles.filterLabel}>Dia</span>
            <select className={styles.filterSelect} value={filterDay} onChange={e => setFilterDay(e.target.value)}>
              <option value="Todos">Todos</option>
              {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* Month */}
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Mês</span>
            <select className={styles.filterSelect} value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>

          {/* Year */}
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Ano</span>
            <select className={styles.filterSelect} value={filterYear} onChange={e => setFilterYear(e.target.value)}>
              {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div className={styles.filterDivider} />

          {/* Unit */}
          <div className={styles.filterGroup}>
            <MapPin size={13} color="#6366f1" />
            <span className={styles.filterLabel}>Unidade</span>
            <select className={styles.filterSelect} value={filterUnit} onChange={e => setFilterUnit(e.target.value)}>
              <option value="Todas">Todas</option>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          <div className={styles.filterDivider} />

          {/* Payment */}
          <div className={styles.filterGroup}>
            <CreditCard size={13} color="#6366f1" />
            <span className={styles.filterLabel}>Pagamento</span>
            <select className={styles.filterSelect} value={filterPay} onChange={e => setFilterPay(e.target.value)}>
              <option value="Todas">Todas</option>
              <option>Cartão de Crédito</option>
              <option>Cartão de Débito</option>
              <option>Boleto/Carnê</option>
              <option>Concessionária de Energia</option>
            </select>
          </div>

          <div className={styles.filterDivider} />

          {/* Refresh */}
          <button
            onClick={refresh}
            disabled={refreshing}
            style={{
              display: "flex", alignItems: "center", gap: "0.4rem",
              background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)",
              borderRadius: "8px", color: "#818cf8", fontSize: "0.78rem", fontWeight: 600,
              padding: "0.4rem 0.85rem", cursor: "pointer", transition: "all 0.2s", fontFamily: "inherit",
            }}
          >
            <RefreshCw size={13} className={refreshing ? styles.spin : ""} />
            {refreshing ? "Atualizando…" : "Atualizar"}
          </button>
        </div>

        {/* Live indicator */}
        <div className={styles.liveIndicator}>
          <div className={styles.liveDot} />
          <span suppressHydrationWarning>Tempo Real · {currentTime || "--:--:--"}</span>
        </div>
      </motion.div>

      {/* ── CONTENT ── */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className={styles.content}
      >

        {/* ═══════════ SEÇÃO 1 — TABELAS ═══════════ */}
        <motion.section
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <SectionHeader
            icon={<TableProperties size={15} />}
            title="Indicadores por Unidade"
            subtitle={
              <span suppressHydrationWarning>
                {`${MONTHS[Number(filterMonth) - 1]} ${filterYear} · atualizado às ${lastUpdate || "--:--:--"}`}
              </span>
            }
          />

          {/* Tabela 1 — Vendas Diárias */}
          <div style={{ marginBottom: "1.5rem" }}>
            <DailyTable title="Quantidade de Vendas Diárias" rows={salesGrid} />
          </div>

          {/* Tabela 2 — Desfiliação */}
          <div style={{ marginBottom: "1.5rem" }}>
            <DailyTable title="Desfiliação" rows={unfilGrid} />
          </div>

          {/* Tabelas 3, 4, 5 — Row trio */}
          <div className={styles.tripleTableRow}>
            <DiscountTable data={discounts} />
            <QualityTable  data={quality} />
            <BalanceTable  data={balance} />
          </div>
        </motion.section>

        {/* ═══════════ SEÇÃO 2 — GRÁFICOS ═══════════ */}
        <motion.section
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <SectionHeader
            icon={<BarChart2 size={15} />}
            title="Análise Gráfica"
            subtitle="Comparativos por unidade e forma de pagamento"
          />

          <div className={styles.chartsRow}>
            {/* Charts components stay as they are, but their container is animated */}
            {/* Gráfico 1 — QIA Mês (barras horizontais) */}
            <div className={styles.chartCard}>
              <div className={styles.chartCardHeader}>
                <LayoutGrid size={14} color="#818cf8" />
                <h3 className={styles.chartTitle}>QIA Mês</h3>
              </div>
              <div className={styles.chartBody}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={qiaData} layout="vertical" margin={{ top: 4, right: 20, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis type="number" stroke="#475569" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis dataKey="unit" type="category" stroke="#475569" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" name="QIA" radius={[0, 4, 4, 0]}>
                      {qiaData.map((_, i) => <Cell key={i} fill={COLORS_CHART[i % COLORS_CHART.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gráfico 2 — App Baixado */}
            <div className={styles.chartCard}>
              <div className={styles.chartCardHeader}>
                <TrendingUp size={14} color="#818cf8" />
                <h3 className={styles.chartTitle}>App Baixado</h3>
              </div>
              <div className={styles.chartBody}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={appData} margin={{ top: 4, right: 8, left: -16, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="unit" stroke="#475569" tick={{ fill: "#64748b", fontSize: 10, angle: -30, textAnchor: "end" }} axisLine={false} tickLine={false} />
                    <YAxis stroke="#475569" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                    <Bar dataKey="sim" name="Sim" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="nao" name="Não" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gráfico 3 — Forma de Pagamento */}
            <div className={styles.chartCard}>
              <div className={styles.chartCardHeader}>
                <CreditCard size={14} color="#818cf8" />
                <h3 className={styles.chartTitle}>Forma de Pagamento</h3>
              </div>
              <div className={styles.chartBody}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={paymentData} margin={{ top: 4, right: 8, left: -16, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="unit" stroke="#475569" tick={{ fill: "#64748b", fontSize: 10, angle: -30, textAnchor: "end" }} axisLine={false} tickLine={false} />
                    <YAxis stroke="#475569" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
                    <Bar dataKey="credito" name="Crédito"  fill="#6366f1" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="debito"  name="Débito"   fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="boleto"  name="Boleto"   fill="#14b8a6" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="energia" name="Energia"  fill="#f59e0b" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </motion.section>
      </motion.div>
    </div>
  );
}
