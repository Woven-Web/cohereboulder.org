import { useEffect } from "react";
import { NavLink } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { Sun, CalendarDays, Sparkles, Menu } from 'lucide-react';
export function CompanionNav() {
    const { tr } = useLanguage();
    useEffect(() => {
        const media = matchMedia('(display-mode: standalone)');
        const update = () => document.documentElement.classList.toggle('companion-standalone', media.matches || (navigator as Navigator & {
            standalone?: boolean;
        }).standalone === true);
        update();
        media.addEventListener('change', update);
        return () => { media.removeEventListener('change', update); document.documentElement.classList.remove('companion-standalone'); };
    }, []);
    return <nav className="companion-bottom" aria-label={tr('companion.heading')}>
 {([['/today', 'today', Sun], ['/calendar', 'calendar', CalendarDays], ['/quests', 'quests', Sparkles], ['/more', 'more', Menu]] as const).map(([path, key, Icon]) => <NavLink key={path} to={path}><Icon aria-hidden="true" size={22}/>{tr(key === 'calendar' ? 'nav.calendar' : 'companion.' + key)}</NavLink>)}
 </nav>;
}
