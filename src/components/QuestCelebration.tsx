import * as DialogPrimitive from '@radix-ui/react-dialog';
import { DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';

export function QuestCelebration({ tr, onDismissFocus }: { tr: (key: string) => string; onDismissFocus: () => void }) {
    return <DialogPrimitive.Content className="companion-celebration" onCloseAutoFocus={event => { event.preventDefault(); onDismissFocus(); }}>
        <span aria-hidden="true" className="companion-yay">✦ ☀ ✦</span>
        <DialogTitle className="companion-yay">{tr('companion.yay')}</DialogTitle>
        <DialogDescription>{tr('companion.done')}</DialogDescription>
        <DialogClose asChild><button>{tr('companion.continue')}</button></DialogClose>
    </DialogPrimitive.Content>;
}
