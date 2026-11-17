"use client";
import { useEffect } from "react";

/**
 * Prepares every table on the page for the phone layout in globals.css, where each row becomes a small card
 * and each cell reads "Column: value". It copies the column headings onto the cells so no page has to do it by hand,
 * and runs again whenever the page content changes.
 */
export function StackTables() {
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const label = () => {
      for (const table of main.querySelectorAll("table")) {
        const heads: string[] = [];
        for (const th of table.querySelectorAll<HTMLTableCellElement>("thead th")) {
          for (let i = 0; i < (th.colSpan || 1); i++) heads.push((th.textContent ?? "").trim());
        }
        if (!heads.length) continue;
        table.setAttribute("data-stack", "");
        for (const row of table.querySelectorAll<HTMLTableRowElement>("tbody tr, tfoot tr")) {
          let col = 0;
          for (const cell of row.cells) {
            const field = !!cell.querySelector("input:not([type=hidden]), select, textarea");
            const text = cell.colSpan > 1 ? "" : heads[col] ?? "";
            col += cell.colSpan || 1;
            if (cell.getAttribute("data-label") !== text) cell.setAttribute("data-label", text);
            cell.toggleAttribute("data-field", field);
            cell.toggleAttribute("data-title", cell === row.cells[0] && !field && row.cells.length > 1);
            cell.toggleAttribute("data-empty", !field && !cell.children.length && !(cell.textContent ?? "").trim());
          }
        }
      }
    };
    label();
    let queued = 0;
    const watch = new MutationObserver(() => { cancelAnimationFrame(queued); queued = requestAnimationFrame(label); });
    watch.observe(main, { childList: true, subtree: true });
    return () => { watch.disconnect(); cancelAnimationFrame(queued); };
  }, []);
  return null;
}
