"use client";

import { useCallback, useState } from "react";
import { isAbort } from "@/lib/client";
import { useAbortableFetch } from "./useAbortableFetch";
import { usePolling } from "./usePolling";

/**
 * Sumber data JSON sederhana yang di-poll selama `enabled`.
 *  - clearOnError: true  → saat gagal, data dikosongkan (baris UI-nya hilang; jangan mengarang).
 *  - clearOnError: false → data lama dipertahankan, `error` yang menandai kegagalan.
 */
export function useResource<T>(url: string, ms: number, enabled: boolean, clearOnError: boolean) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const fetchJson = useAbortableFetch();
  const load = useCallback(async () => {
    try {
      setData(await fetchJson<T>(url));
      setError(false);
    } catch (e) {
      if (isAbort(e)) return;
      setError(true);
      if (clearOnError) setData(null);
    }
  }, [fetchJson, url, clearOnError]);
  usePolling(load, ms, enabled);
  return { data, error, load };
}
