'use client';

import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import styles from './RichText.module.css';

/**
 * Texto dos artigos da Ajuda (editado no Painel Master). Formatação
 * simples e segura -- nada de HTML cru:
 *   parágrafos separados por linha em branco, listas com "- ",
 *   **negrito**, `código`, blocos ``` (com botão de copiar) e links.
 * {{APP_URL}} vira o endereço do sistema.
 */

const URL_PATTERN = /(https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?])/g;

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // **negrito** e `código` primeiro; o resto passa pelos links.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  parts.forEach((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      nodes.push(<strong key={key}>{renderInline(part.slice(2, -2), key)}</strong>);
    } else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      nodes.push(<code key={key} className={styles.inlineCode}>{part.slice(1, -1)}</code>);
    } else if (part) {
      part.split(URL_PATTERN).forEach((chunk, chunkIndex) => {
        if (!chunk) return;
        if (/^https?:\/\//.test(chunk)) {
          nodes.push(<a key={`${key}-${chunkIndex}`} href={chunk} target="_blank" rel="noopener noreferrer">{chunk}</a>);
        } else {
          nodes.push(chunk);
        }
      });
    }
  });
  return nodes;
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Navegador sem permissão de área de transferência: o texto continua selecionável.
    }
  };
  return (
    <div className={styles.codeBlock}>
      <button type="button" className={styles.copyBtn} onClick={copy}>
        {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copiado' : 'Copiar'}
      </button>
      <pre><code>{code}</code></pre>
    </div>
  );
}

export function fillPlaceholders(text: string) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.vorticetecnologia.com.br';
  return text.replace(/\{\{\s*APP_URL\s*\}\}/g, origin);
}

export default function RichText({ text, className }: { text: string; className?: string }) {
  const filled = fillPlaceholders(text || '');
  const segments = filled.split(/```/);

  return (
    <div className={`${styles.rich} ${className || ''}`}>
      {segments.map((segment, segmentIndex) => {
        if (segmentIndex % 2 === 1) {
          // Bloco de código: tira a quebra de linha logo depois da abertura.
          return <CodeBlock key={segmentIndex} code={segment.replace(/^[a-z]*\n/i, '').replace(/\n$/, '')} />;
        }
        return segment
          .split(/\n\s*\n/)
          .map((block) => block.trim())
          .filter(Boolean)
          .map((block, blockIndex) => {
            const key = `${segmentIndex}-${blockIndex}`;
            const lines = block.split('\n');
            if (lines.every((line) => /^\s*-\s+/.test(line))) {
              return (
                <ul key={key}>
                  {lines.map((line, lineIndex) => <li key={lineIndex}>{renderInline(line.replace(/^\s*-\s+/, ''), `${key}-${lineIndex}`)}</li>)}
                </ul>
              );
            }
            return (
              <p key={key}>
                {lines.map((line, lineIndex) => (
                  <React.Fragment key={lineIndex}>
                    {lineIndex > 0 && <br />}
                    {renderInline(line, `${key}-${lineIndex}`)}
                  </React.Fragment>
                ))}
              </p>
            );
          });
      })}
    </div>
  );
}
