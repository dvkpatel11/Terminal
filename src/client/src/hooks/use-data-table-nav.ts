import { useCallback, useRef, useEffect } from "react";

interface UseDataTableNavOptions {
  rowSelector?: string; // CSS selector for rows
  onSelect?: (row: HTMLElement, index: number) => void;
}

export function useDataTableNav({ rowSelector = "tbody tr", onSelect }: UseDataTableNavOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeIndex = useRef(-1);

  const rows = useCallback(() => {
    if (!containerRef.current) return [];
    return Array.from(containerRef.current.querySelectorAll(rowSelector));
  }, [rowSelector]);

  const setActive = useCallback((index: number) => {
    const allRows = rows();
    if (index < 0 || index >= allRows.length) return;

    // Remove previous active
    allRows.forEach(r => r.classList.remove("data-table-active"));

    activeIndex.current = index;
    allRows[index].classList.add("data-table-active");
    allRows[index].scrollIntoView({ block: "nearest" });
    onSelect?.(allRows[index] as HTMLElement, index);
  }, [rows, onSelect]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!containerRef.current?.contains(document.activeElement)) return;

    const allRows = rows();
    if (allRows.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive(Math.min(activeIndex.current + 1, allRows.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive(Math.max(activeIndex.current - 1, 0));
        break;
      case "Enter":
        if (activeIndex.current >= 0) {
          onSelect?.(allRows[activeIndex.current] as HTMLElement, activeIndex.current);
        }
        break;
    }
  }, [rows, setActive, onSelect]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return { containerRef, setActive };
}