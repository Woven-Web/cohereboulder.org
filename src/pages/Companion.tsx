import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Share, SquarePlus, Smartphone } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { companionEvents, companionRequest, type CompanionToday } from '@/lib/api';
import { getInstallState, subscribeInstall, clearInstallPrompt } from '@/lib/install';
import { anonymousDevice, eventsForDays, installPlatform, localGet, localSet, questChecks, currentDenverDate } from '@/lib/companion';
const keyBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
export default function Companion() {
    const { tr, language, toggleLanguage } = useLanguage();
    const route = useLocation().pathname;
    const [date, setDate] = useState(currentDenverDate);
    const { data, refetch, isLoading, isError } = useQuery({ queryKey: ['companion'], queryFn: () => companionRequest<CompanionToday>('today'), retry: 1 });
    const events = useQuery({ queryKey: ['companion-events'], queryFn: companionEvents, retry: 1 });
    const refetchEvents = events.refetch;
    const { prompt, installed } = useSyncExternalStore(subscribeInstall, getInstallState, getInstallState);
    const [notice, setNotice] = useState(''), [permission, setPermission] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission), [subscribed, setSubscribed] = useState(false), [busy, setBusy] = useState(false);
    const [reply, setReply] = useState(''), [name, setName] = useState(''), [answered, setAnswered] = useState(false);
    const [checks, setChecks] = useState<string[]>(questChecks), [celebrate, setCelebrate] = useState(false);
    const [shareUrl, setShareUrl] = useState(''), [shareName, setShareName] = useState('');
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistration().then(r => r?.pushManager?.getSubscription()).then(s => setSubscribed(!!s)).catch(() => { });
        }
    }, []);
    useEffect(() => {
        const tick = () => { const next=currentDenverDate(); if(next!==date){setDate(next);void refetch();void refetchEvents();} };
        const timer=window.setInterval(tick,1000);
        window.addEventListener('focus',tick);
        return()=>{window.clearInterval(timer);window.removeEventListener('focus',tick);};
    }, [date, refetch, refetchEvents]);
    useEffect(()=>{setAnswered(false);setReply('');setName('');setNotice('');},[data?.date]);
    useEffect(()=>{
        if(!subscribed) return;
        let active=true;
        void navigator.serviceWorker.getRegistration().then(r=>r?.pushManager.getSubscription()).then(async sub=>{
            if(!sub) return;
            const json=sub.toJSON();
            await companionRequest('subscriptions',{device_id:anonymousDevice(),endpoint:json.endpoint,p256dh:json.keys?.p256dh,auth:json.keys?.auth,language},'PATCH');
        }).catch(()=>{if(active)setNotice('error');});
        return()=>{active=false;};
    },[language,subscribed]);
    const platform = installPlatform(navigator.userAgent, installed, !!prompt);
    const ios = platform === 'ios' || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1 && !installed);
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';
    const localized = (en: string | undefined, es: string | undefined) => language === 'es' ? (es || en || '') : (en || '');
    async function enable() {
        if (!supported || !data?.pushKey || ios)
            return;
        // This call is synchronous from the button gesture, before any await.
        const permissionRequest = Notification.requestPermission();
        setBusy(true);
        setNotice('');
        try {
            const result = await permissionRequest;
            setPermission(result);
            if (result !== 'granted')
                return;
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription() ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(data.pushKey) });
            const json = sub.toJSON();
            try {
                await companionRequest('subscriptions', { device_id: anonymousDevice(), endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth, language });
            }
            catch (error) {
                await sub.unsubscribe();
                throw error;
            }
            setSubscribed(true);
            localSet('cohere-push-off', 'false');
        }
        catch {
            setNotice('error');
        }
        finally {
            setBusy(false);
        }
    }
    async function disable() {
        setBusy(true);
        setNotice('');
        try {
            // Remove the server endpoint first: if offline, keep the action available for retry.
            const reg = await navigator.serviceWorker.getRegistration();
            const sub = await reg?.pushManager.getSubscription();
            const json = sub?.toJSON();
            await companionRequest('subscriptions', { device_id: anonymousDevice(), ...(json ? {endpoint:json.endpoint,p256dh:json.keys?.p256dh,auth:json.keys?.auth} : {}) }, 'DELETE');
            await sub?.unsubscribe();
            setSubscribed(false);
            localSet('cohere-push-off', 'true');
            setNotice('off');
        }
        catch {
            setNotice('error');
        }
        finally {
            setBusy(false);
        }
    }
    async function sendReply(event: React.FormEvent) { event.preventDefault(); setBusy(true); setNotice(''); try {
        await companionRequest('replies', { device_id: anonymousDevice(), reply, name: name || undefined });
        setAnswered(true);
        setNotice('saved');
    }
    catch (error) {
        setNotice(error instanceof Error && error.message === '429' ? 'rateLimit' : 'error');
    }
    finally {
        setBusy(false);
    } }
    async function complete(id: string) {
        const next = checks.includes(id) ? checks.filter(k => k !== id) : [...checks, id];
        setChecks(next);
        localSet('cohere-quests', JSON.stringify(next));
        if (!next.includes(id))
            return;
        await report(id);
    }
    async function report(id: string) {
        setBusy(true);
        setNotice('reporting');
        try {
            await companionRequest('completions', { device_id: anonymousDevice(), quest_id: id });
            setNotice('yay');
            setCelebrate(true);
        }
        catch {
            setNotice('error');
        }
        finally {
            setBusy(false);
        }
    }
    async function share(url: string, title: string) {
        if (navigator.share) {
            try {
                await navigator.share({ title, url });
                return;
            }
            catch (error) {
                if (error instanceof Error && error.name === 'AbortError')
                    return;
            }
        }
        setShareUrl(url);
        setShareName(title);
    }
    const daily = data?.daily;
    return <><Navigation /><main className="companion-page">
 <header><h1>{tr('companion.' + (route === '/quests' ? 'quests' : route === '/more' ? 'more' : 'heading'))}</h1><button onClick={toggleLanguage}>{tr('companion.language')}</button></header>
 <div className="companion-links"><Link to="/today">{tr('companion.today')}</Link><Link to="/calendar">{tr('nav.calendar')}</Link><Link to="/quests">{tr('companion.quests')}</Link><Link to="/more">{tr('companion.more')}</Link></div>
 {isLoading && <p>{tr('companion.loading')}</p>}{isError && <p role="status">{tr('companion.offline')}</p>}
 {notice && <p role="status" className={celebrate && notice === 'yay' ? 'companion-yay' : ''}>{tr('companion.' + notice)}</p>}
 {route === '/today' && <>
 <section><h2>{tr('companion.practice')}</h2>{daily ? <><h3>{localized(daily.title, daily.title_es)}</h3><p className="whitespace-pre-wrap">{localized(daily.body, daily.body_es)}</p></> : <p>{tr('companion.empty')}</p>}</section>
 <section><h2>{tr('companion.events')}</h2>{events.isError && <p>{tr('companion.offline')}</p>}{data && eventsForDays(events.data ?? [], data.date).filter(e => e.status !== 'cancelled').map(e => { const path = '/events/' + encodeURIComponent(e.did) + '/' + encodeURIComponent(e.rkey); return <article key={path}><h3><Link to={path}>{e.name}</Link></h3><p>{e.startsAt && new Intl.DateTimeFormat(language, { timeZone: 'America/Denver', weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(e.startsAt))}</p><button onClick={() => void share(location.origin + path, e.name)}>{tr('companion.share')}</button></article>; })}
 {data && !eventsForDays(events.data ?? [], data.date).length && <p>{tr('companion.noEvents')}</p>}<Link to="/calendar">{tr('nav.calendar')}</Link></section>
 {daily?.question && <section><h2>{tr('companion.question')}</h2><p>{localized(daily.question, daily.question_es)}</p><form onSubmit={sendReply}><label>{tr('companion.reply')}<textarea required maxLength={2000} value={reply} onChange={e => setReply(e.target.value)} disabled={answered}/></label><label>{tr('companion.name')}<input maxLength={80} value={name} onChange={e => setName(e.target.value)} disabled={answered}/></label><button disabled={busy || answered} type="submit">{tr('companion.send')}</button></form></section>}
 <Link to="/more">{tr('companion.install')}</Link>
 </>}
 {route === '/quests' && <section>{data?.quests.length ? data.quests.map(q => <article key={q.id}><label className="companion-check"><input type="checkbox" checked={checks.includes(q.id)} disabled={busy} onChange={() => void complete(q.id)}/><span>{localized(q.title, q.title_es)}</span></label><p>{localized(q.description, q.description_es)}</p>{checks.includes(q.id) && <span>{tr('companion.done')}</span>}{checks.includes(q.id) && notice === 'error' && <button onClick={() => void report(q.id)}>{tr('companion.send')}</button>}</article>) : <p>{tr('companion.noQuests')}</p>}</section>}
 {route === '/more' && <>
 <section><h2>{tr('companion.install')}</h2>{installed ? <p>{tr('companion.installed')}</p> : ios ? <><p>{tr('companion.iosIntro')}</p><ol className="companion-ios"><li><Share aria-hidden="true"/>{tr('companion.iosShare')}</li><li><SquarePlus aria-hidden="true"/>{tr('companion.iosAdd')}</li><li><Smartphone aria-hidden="true"/>{tr('companion.iosOpen')}</li></ol></> : prompt ? <button onClick={() => { void prompt.prompt().then(() => prompt.userChoice).then(() => clearInstallPrompt()).catch(() => setNotice('error')); }}>{tr('companion.install')}</button> : <p>{tr('companion.manual')}</p>}</section>
 <section><h2>{tr('companion.notifications')}</h2><p>{tr('companion.schedule')}</p><p>{tr('companion.' + (!supported ? 'unsupported' : !data?.pushKey ? 'disabled' : permission === 'denied' ? 'denied' : subscribed ? 'enabled' : 'off'))}</p>
 {supported && data?.pushKey && permission !== 'denied' && !ios && !subscribed && <button onClick={() => void enable()} disabled={busy}>{tr('companion.enable')}</button>}
 {(subscribed || localGet('cohere-push-off') !== 'true') && <button onClick={() => void disable()} disabled={busy}>{tr('companion.disable')}</button>}
 </section><section><p>{tr('companion.privacy')}</p><Link to="/">{tr('companion.back')}</Link></section>
 </>}
 {shareUrl && <section><p>{shareName}</p><a href={'sms:?body=' + encodeURIComponent(shareName + ' ' + shareUrl)}>{tr('companion.sms')}</a><button onClick={() => { void navigator.clipboard.writeText(shareUrl).then(() => setNotice('copied')).catch(() => setNotice('error')); }}>{tr('companion.copy')}</button></section>}
 </main></>;
}
