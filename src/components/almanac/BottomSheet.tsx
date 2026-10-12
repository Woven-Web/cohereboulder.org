import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useShell } from "./shell-context";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}

/**
 * A modal sheet that rises from the bottom on phones and sits centred on the
 * Daylight. Radix gives it the focus trap, Escape and aria-modal; it mounts
 * inside .alm so it keeps the Almanac tokens. One 0.22s slide, none on reduced motion.
 */
export function BottomSheet({ open, onOpenChange, title, description, children }: Props) {
  const { container } = useShell();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={container}>
        <Dialog.Overlay className="scrim" />
        <div className="sheet-layer">
          <Dialog.Content className="sheet" {...(description ? {} : { "aria-describedby": undefined })}>
            <div className="sheet__grab" aria-hidden="true" />
            <div className="sheet__body">
              <Dialog.Title className="h2">{title}</Dialog.Title>
              {description && <Dialog.Description className="lede">{description}</Dialog.Description>}
              {children}
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
