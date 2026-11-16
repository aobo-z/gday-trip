import { useMemo } from "react";
import { useOverlay } from "../ui/overlayContext";
import IdeaDrawer from "./IdeaDrawer";
import PlanDrawer from "./PlanDrawer";
import PersonDrawer from "./PersonDrawer";

/** Opens an activity (votes, preferences, comments) or a scheduled plan in a window, or a person's profile in a drawer. */
export function usePeek() {
  const o = useOverlay();
  return useMemo(() => ({
    idea: (id: number) => o.drawer(<IdeaDrawer id={id} />, { modal: true }),
    plan: (id: number) => o.drawer(<PlanDrawer id={id} />, { modal: true }),
    person: (id: number, name: string) => o.drawer(<PersonDrawer userId={id} name={name} />),
  }), [o]);
}
