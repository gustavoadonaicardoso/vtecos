import React from "react";
import { ArrowRight, MousePointer2 } from "lucide-react";
import styles from "../automations.module.css";
import type { NodeDefinition, NodeType } from "../types";

interface BlockLibraryProps {
  filteredLibrary: { category: string; items: NodeDefinition[] }[];
  isSearchOpen: boolean;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onAddNode: (definition: NodeDefinition) => void;
  onDragStart: (nodeType: NodeType) => void;
  onDragEnd: () => void;
}

export default function BlockLibrary({ filteredLibrary, isSearchOpen, searchTerm, onSearchTermChange, onAddNode, onDragStart, onDragEnd }: BlockLibraryProps) {
  return (
    <>
      <div className={styles.libraryHeader}>
        <div className={styles.sidebarTitle}>BIBLIOTECA DE BLOCOS</div>
        {isSearchOpen && <input autoFocus className={styles.librarySearch} value={searchTerm} onChange={event => onSearchTermChange(event.target.value)} placeholder="Buscar bloco..." />}
      </div>

      <div className={styles.libraryContainer}>
        {filteredLibrary.map(category => (
          <div key={category.category} className={styles.libCategory}>
            <div className={styles.categoryLabel}>{category.category}</div>
            <div className={styles.itemList}>
              {category.items.map(item => {
                const BlockIcon = item.icon;
                return (
                  <button
                    type="button"
                    draggable
                    className={styles.draggableBlock}
                    key={item.type}
                    onClick={() => onAddNode(item)}
                    onDragStart={event => { event.dataTransfer.setData("application/x-vortice-node", item.type); onDragStart(item.type); }}
                    onDragEnd={onDragEnd}
                    title="Clique para adicionar ou arraste para o canvas"
                  >
                    <div className={styles.blockHeader} style={{ background: item.color }}><BlockIcon size={16} color="white" /></div>
                    <div className={styles.blockInfo}><span className={styles.blockLabel}>{item.label}</span><span className={styles.blockDesc}>{item.desc}</span></div>
                    <ArrowRight size={14} className={styles.blockArrow} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {filteredLibrary.length === 0 && <div className={styles.emptyLibrary}>Nenhum bloco encontrado.</div>}
      </div>
      <div className={styles.sidebarHint}><MousePointer2 size={12} /> CLIQUE OU ARRASTE PARA ADICIONAR</div>
    </>
  );
}
