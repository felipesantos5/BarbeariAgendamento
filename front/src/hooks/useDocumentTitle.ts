import { useEffect } from "react";

export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    // Cleanup: restaurar título anterior quando componente desmontar
    return () => {
      document.title = previousTitle;
    };
  }, [title]);
}
