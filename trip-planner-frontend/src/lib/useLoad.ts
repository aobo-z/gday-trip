import { useCallback, useEffect, useState, type DependencyList } from "react";
import { apiErrorMessage } from "../api/apiError";

/**
 * Runs a request when its dependencies change. `data` is undefined until the first answer (and keeps the last
 * answer while a retry runs); `error` is the message to show when it failed, so a failed request is never
 * mistaken for an empty list. A result that arrives after the dependencies changed is ignored.
 */
export function useLoad<T>(load: () => Promise<T>, deps: DependencyList, fallback = "Couldn't load this.") {
  const [state, setState] = useState<{ data?: T; error: string }>({ error: "" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    load().then((data) => { if (live) setState({ data, error: "" }); })
      .catch((e) => { if (live) setState((s) => ({ data: s.data, error: apiErrorMessage(e, fallback) })); });
    return () => { live = false; };
  }, [...deps, attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  const retry = useCallback(() => { setState((s) => ({ data: s.data, error: "" })); setAttempt((n) => n + 1); }, []);
  return { data: state.data, error: state.error, retry };
}
