"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { createPortal } from "react-dom";
import styles from "./HelpFAB.module.css";

export default function HelpFAB() {
  const pathname = usePathname();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || pathname === "/messages") {
    return null;
  }

  return createPortal(
    <div className={styles.fabContainer}>
      <Link
        href="/help"
        className={styles.fab}
        title="Central de Ajuda"
        aria-label="Central de Ajuda"
      >
        <span className={styles.pulse} />
        <LifeBuoy size={24} />
      </Link>
    </div>,
    document.body
  );
}