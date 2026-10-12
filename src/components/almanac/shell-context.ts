import { createContext, useContext } from "react";

interface ShellContext {
  /** Where portalled overlays mount, so they inherit the .alm tokens. */
  container: HTMLElement | null;
  toast: (message: string) => void;
  /** Reserve room for the pinned action bar (Today's "I did it"). */
  setHasBar: (on: boolean) => void;
}
export const Ctx = createContext<ShellContext>({ container: null, toast: () => {}, setHasBar: () => {} });
export const useShell = () => useContext(Ctx);

