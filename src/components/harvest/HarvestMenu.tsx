import { useEffect, useId, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { BottomSheet } from "@/components/almanac/BottomSheet";
import { useShell } from "@/components/almanac/shell-context";
import { useLanguage } from "@/contexts/LanguageContext";
import { deleteHarvest } from "@/lib/harvest";

/**
 * The ⋯ on your own harvest: Edit, Delete. Delete asks first ("Delete this harvest?")
 * and nothing is removed until that is confirmed. Escape closes the menu and puts
 * focus back on the ⋯; so does cancelling the confirm.
 */
export function HarvestMenu({ harvestId, onEdit, onDeleted }: { harvestId: string; onEdit: () => void; onDeleted: () => void }) {
  const { tr } = useLanguage();
  const { toast } = useShell();
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const remove = useMutation({
    mutationFn: () => deleteHarvest(harvestId),
    onSuccess: () => { setConfirming(false); onDeleted(); },
    onError: () => toast(tr("notify.harvest.deleteFailed")),
  });

  useEffect(() => {
    if (!open) return;
    const items = () => Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    items()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); setOpen(false); button.current?.focus(); return; }
      if (event.key === "Tab") { setOpen(false); return; }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const list = items();
      const at = list.indexOf(document.activeElement as HTMLButtonElement);
      list[(at + (event.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer);
    return () => { document.removeEventListener("keydown", onKey, true); document.removeEventListener("pointerdown", onPointer); };
  }, [open]);

  return (
    <span className="hvmenu">
      <button ref={button} type="button" className="hvmenu__btn" aria-label={tr("notify.harvest.menu")} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        data-testid="harvest-menu" onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal aria-hidden="true" size={20} />
      </button>
      {open && (
        <div ref={menu} id={menuId} className="hvmenu__list" role="menu" aria-label={tr("notify.harvest.menu")}>
          <button type="button" role="menuitem" data-testid="harvest-menu-edit" onClick={() => { setOpen(false); onEdit(); }}>{tr("notify.harvest.edit")}</button>
          <button type="button" role="menuitem" data-testid="harvest-menu-delete" onClick={() => { setOpen(false); setConfirming(true); }}>{tr("notify.harvest.delete")}</button>
        </div>
      )}
      <BottomSheet
        open={confirming} onOpenChange={(next) => !next && setConfirming(false)}
        title={tr("notify.harvest.deleteTitle")} description={tr("notify.harvest.deleteBody")}
        onCloseAutoFocus={(event) => { event.preventDefault(); button.current?.focus(); }}
      >
        <button type="button" className="btn btn--primary btn--block" disabled={remove.isPending} data-testid="harvest-delete-yes" onClick={() => remove.mutate()}>{tr("notify.harvest.deleteYes")}</button>
        <button type="button" className="btn btn--quiet btn--block" data-testid="harvest-delete-cancel" onClick={() => setConfirming(false)}>{tr("notify.harvest.deleteKeep")}</button>
      </BottomSheet>
    </span>
  );
}
