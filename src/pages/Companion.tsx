import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogPortal } from '@/components/ui/dialog';
import { QuestCelebration } from '@/components/QuestCelebration';
import { Share, SquarePlus, Smartphone } from 'lucide-react';
import { useMyEvents } from '@/lib/myEvents';
import { denverDateKey } from '@/lib/events';
import { useLanguage } from '@/contexts/LanguageContext';
import { companionEvents, companionRequest } from '@/lib/api';
import { anonymousDevice, localGet, localSet, questChecks, currentDenverDate } from '@/lib/companion';
import {
    FESTIVAL_DATES, PRACTICE_DONE_EVENT, SAMPLE_DAY_ONE, dayNumber, daysUntilStart, denverMinutes, formatDay, formatMinutes,
    markPracticeDone, practiceDoneDays, sunTimes,
} from '@/lib/festival';
import { clearReminderNotice, disableReminders, enableReminders, getReminderState, reminderSupport, useReminders } from '@/lib/reminders';
import { useCompanionToday } from '@/lib/useCompanionToday';
import { useInstallOffer } from '@/lib/useInstallOffer';
import { AlmanacShell } from '@/components/almanac/AlmanacShell';
import { useShell } from '@/components/almanac/shell-context';
import { HexTrail } from '@/components/almanac/HexTrail';
import { Folio, Ridgeline } from '@/components/almanac/Folio';
import { PracticeBlock } from '@/components/almanac/PracticeBlock';
import { ObservedRow, ObservedStamp } from '@/components/almanac/ObservedStamp';
import { QuestionBlock } from '@/components/almanac/QuestionBlock';
import { YourNextStrip, type NextItem } from '@/components/almanac/YourNextStrip';
import { EventRow } from '@/components/almanac/EventRow';
import { fill, useWide } from '@/components/almanac/format';
import { seatOf } from '@/components/almanac/seat';
import { useLook } from '@/lib/look';
import gatheringPhoto from '@/assets/photos/gathering.webp';

export default function Companion() {
    const route = useLocation().pathname;
    return <AlmanacShell>
        {route === '/quests' ? <QuestsView /> : route === '/more' ? <MoreView /> : <TodayView />}
    </AlmanacShell>;
}

/** Re-renders every second the Denver date or minute changes; refetches on rollover. */
function useDenverClock(onRollover: () => void) {
    const [date, setDate] = useState(currentDenverDate);
    const [minutes, setMinutes] = useState(() => denverMinutes(new Date()));
    const roll = useRef(onRollover);
    roll.current = onRollover;
    useEffect(() => {
        const tick = () => {
            const next = currentDenverDate();
            setDate(prev => { if (prev !== next) roll.current(); return next; });
            setMinutes(denverMinutes(new Date()));
        };
        const timer = window.setInterval(tick, 1000);
        window.addEventListener('focus', tick);
        return () => { window.clearInterval(timer); window.removeEventListener('focus', tick); };
    }, []);
    return { date, minutes };
}

function usePracticeDone() {
    const [done, setDone] = useState<string[]>(practiceDoneDays);
    useEffect(() => {
        const update = () => setDone(practiceDoneDays());
        window.addEventListener(PRACTICE_DONE_EVENT, update);
        window.addEventListener('storage', update);
        return () => { window.removeEventListener(PRACTICE_DONE_EVENT, update); window.removeEventListener('storage', update); };
    }, []);
    return done;
}

function TodayView() {
    const { tr, language } = useLanguage();
    const { toast } = useShell();
    const wide = useWide();
    const eco = useLook() === 'ecology';
    const { data, refetch, isLoading, isError } = useCompanionToday();
    const events = useQuery({ queryKey: ['companion-events'], queryFn: companionEvents, retry: 1 });
    const refetchEvents = events.refetch;
    const { date, minutes } = useDenverClock(() => { void refetch(); void refetchEvents(); });
    const mine = useMyEvents(events.data);
    const done = usePracticeDone();
    const { offer } = useInstallOffer();
    const [reply, setReply] = useState(''), [name, setName] = useState(''), [answered, setAnswered] = useState(false), [writing, setWriting] = useState(false);
    const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
    const [checks] = useState<string[]>(questChecks);
    const replyRef = useRef<HTMLTextAreaElement>(null);
    const offerTimer = useRef<number>();
    useEffect(() => () => window.clearTimeout(offerTimer.current), []);
    useEffect(() => { setAnswered(false); setReply(''); setName(''); setNotice(''); setWriting(false); }, [data?.date]);

    const dayN = dayNumber(date);
    const daily = data?.daily;
    const inFestival = dayN >= 1 && dayN <= 11;
    // Published content always wins; with none, the date says whether to count down, wait, or say thanks.
    const phase = daily ? 'during' : dayN === 0 ? 'before' : dayN === 12 ? 'after' : 'during';
    const localized = (en: string | undefined, es: string | undefined) => language === 'es' ? (es || en || '') : (en || '');
    const isDone = done.includes(date);
    const sun = sunTimes(date);

    const upcomingMine: NextItem[] = mine.items
        .filter(i => i.event.status !== 'cancelled' && i.event.startsAt && Date.parse(i.event.endsAt ?? i.event.startsAt) > Date.now())
        .map(i => ({ event: i.event, seat: seatOf(i) }));
    const mineKeys = new Set(mine.items.map(i => `${i.event.did}/${i.event.rkey}`));
    const todaysEvents = (events.data ?? []).filter(e => e.status !== 'cancelled' && denverDateKey(e.startsAt) === (phase === 'before' ? FESTIVAL_DATES[0] : date));
    const nowEvents = todaysEvents.filter(e => e.startsAt && Date.parse(e.startsAt) <= Date.now() && Date.parse(e.endsAt ?? e.startsAt) > Date.now());
    const laterEvents = todaysEvents.filter(e => e.startsAt && Date.parse(e.startsAt) > Date.now() && !mineKeys.has(`${e.did}/${e.rkey}`)).slice(0, phase === 'before' ? 1 : 2);
    const quest = (data?.quests ?? []).find(q => !checks.includes(q.id));

    function didIt() {
        markPracticeDone(date);
        // The first time only (installOffer remembers): the pair, after a beat.
        offerTimer.current = window.setTimeout(() => { offer('didit'); }, 1000);
    }
    function reflect() {
        setWriting(true);
        window.setTimeout(() => {
            document.getElementById('q')?.scrollIntoView({ block: 'start' });
            replyRef.current?.focus({ preventScroll: true });
        }, 0);
    }
    async function sendReply(event: React.FormEvent) {
        event.preventDefault(); setBusy(true); setNotice('');
        try {
            await companionRequest('replies', { device_id: anonymousDevice(), reply, name: name || undefined });
            setAnswered(true); setNotice('saved');
        } catch (error) {
            setNotice(error instanceof Error && error.message === '429' ? 'rateLimit' : 'error');
        } finally { setBusy(false); }
    }
    async function shareQuestion(text: string) {
        if (navigator.share) {
            try { await navigator.share({ text }); return; } catch (error) { if (error instanceof Error && error.name === 'AbortError') return; }
        }
        try { await navigator.clipboard.writeText(text); toast(tr('almanac.questionCopied')); } catch { toast(tr('companion.error')); }
    }

    const dateLabel = formatDay(date, language);
    const actionBar = phase === 'during' && daily && inFestival ? (
        isDone ? (
            <div className="actionbar" role="region" aria-label={tr('almanac.practiceEyebrow')} data-testid="action-done">
                <div className="actionbar__done">
                    <ObservedStamp small />
                    <span><b>{tr('almanac.observed')}</b><br />{tr(dayN === 11 ? 'almanac.doneBarLast' : 'almanac.doneBar')}</span>
                </div>
            </div>
        ) : (
            <div className="actionbar">
                <button type="button" className="btn btn--primary" data-testid="i-did-it" onClick={didIt}><span className="box" aria-hidden="true" />{tr('almanac.iDidIt')}</button>
            </div>
        )
    ) : null;

    const replyForm = (
        <form onSubmit={sendReply} className="stack" style={{ marginTop: '.6rem' }}>
            <div className="field">
                <label className="field__label" htmlFor="reply-text">{tr('companion.reply')}</label>
                <textarea id="reply-text" ref={replyRef} className="field__input" required maxLength={2000} value={reply} onChange={e => setReply(e.target.value)} disabled={answered} />
            </div>
            <div className="field">
                <label className="field__label" htmlFor="reply-name">{tr('companion.name')}</label>
                <input id="reply-name" className="field__input" maxLength={80} value={name} onChange={e => setName(e.target.value)} disabled={answered} />
                <p className="field__help">{tr('companion.replyAudience')}</p>
            </div>
            <button className="btn btn--line" disabled={busy || answered} type="submit">{tr('companion.send')}</button>
        </form>
    );

    const later = (
        <section className="sched" style={{ marginTop: '2rem' }} aria-labelledby="later-eyebrow">
            <div className="eyebrow" id="later-eyebrow">{tr(phase === 'before' ? 'almanac.thatDay' : 'almanac.laterToday')}</div>
            {events.isError && !isError && <p className="small" role="status">{tr('companion.offline')}</p>}
            {laterEvents.map(e => <EventRow key={`${e.did}/${e.rkey}`} event={e} descLimit={112} />)}
            {phase !== 'before' && nowEvents.length > 0 && (
                <p className="small" style={{ padding: '.6rem 0', borderTop: '1px solid var(--rule)' }}>
                    {tr('almanac.underwayNow')}{nowEvents.map(e => e.name).join(' · ')}
                </p>
            )}
            {laterEvents.length === 0 && nowEvents.length === 0 && !events.isError && phase !== 'before' && <p className="small" style={{ marginTop: '.6rem' }}>{tr('companion.noEvents')}</p>}
            <Link className="list-link" to={`/calendar?day=${phase === 'before' ? FESTIVAL_DATES[0] : date}`}>
                <span>{tr(phase === 'before' ? 'almanac.allEventsThatDay' : 'almanac.allEventsToday')}{todaysEvents.length ? ` · ${todaysEvents.length}` : ''}</span><span aria-hidden="true">→</span>
            </Link>
        </section>
    );

    const questBlock = quest && (
        <section className="quest">
            <span className="folio">{tr('almanac.questEyebrow')}</span>
            <b>{localized(quest.title, quest.title_es)}.</b> {localized(quest.description, quest.description_es)}{' '}
            <Link className="link" to="/quests">{tr('almanac.allQuests')}</Link>
        </section>
    );

    const status = (isError || notice) && (
        <p className="small" role="status" style={{ marginTop: '.6rem' }}>{isError ? tr('companion.offline') : tr('companion.' + notice)}</p>
    );

    const trail = <HexTrail variant="fit" today={date} done={done} />;
    const next = <YourNextStrip items={upcomingMine} total={mine.items.length} today={date} />;
    const photo = (
        <figure className="photo"><img src={gatheringPhoto} alt="" width="900" height="600" loading="lazy" /><figcaption className="cap-mono">{tr('almanac.photoCap')}</figcaption></figure>
    );
    const horizonLabel = language === 'es' ? 'Una línea de cumbres con el sol y un arroyo abajo' : 'A ridgeline with the sun and a creek below';

    if (phase === 'before') {
        const days = daysUntilStart(date);
        const sample = SAMPLE_DAY_ONE[language];
        return <main className="page" style={{ paddingTop: 0 }}>
            <Folio className="pt-3">{formatDay(date, language, true)}</Folio>
            <h1 className="h1" style={{ margin: '.3rem 0 .2rem', fontSize: 'calc(var(--fs-h1) * 1.2)' }}>
                {days === 1 ? tr('almanac.countdownOne') : fill(tr('almanac.countdown'), { n: days })}
            </h1>
            {trail}
            <p className="small" style={{ padding: '.3rem 0 0' }}>{tr('almanac.countdownLine')}</p>
            {status}
            <div className="flow2">
                <div className="flow2__a"><div className="o1">
                    <div className="sample-box" data-testid="sample-day">
                        <span className="sample-flag sample-box__flag">{tr('almanac.sampleDay')}</span>
                        <section className="practice" aria-labelledby="sample-title">
                            <div className="eyebrow">{tr('almanac.sampleEyebrow')}</div>
                            <h2 className="h1 practice__title" id="sample-title">{sample.title}</h2>
                            <p className="practice__body">{sample.body}</p>
                        </section>
                        <button type="button" className="btn btn--primary btn--block" style={{ marginTop: '1rem' }} onClick={() => offer('manual')}>{tr('almanac.remindFirst')}</button>
                    </div>
                </div></div>
                <div className="flow2__b"><div className="o2">{next}</div><div className="o4">{later}</div></div>
            </div>
        </main>;
    }

    if (phase === 'after') {
        return <main className="page" style={{ paddingTop: 0 }}>
            <Folio className="pt-3">{formatDay(date, language, true)}</Folio>
            <h1 className="h1" style={{ margin: '.3rem 0' }}>{tr('companion.heading')}</h1>
            {trail}
            <p className="lede" style={{ marginTop: '1rem' }}>{tr('almanac.over')}</p>
            {status}
            <div className="flow2"><div className="flow2__b"><div className="o2">{next}</div></div></div>
        </main>;
    }

    return <main className="page" style={{ paddingTop: 0 }} data-has-bar={daily ? '' : undefined}>
        <Folio className="pt-3"><span data-testid="folio">{inFestival && <>{fill(tr('almanac.dayOf'), { n: dayN })} · </>}{dateLabel}</span></Folio>
        {trail}
        <Ridgeline minutes={minutes} rise={sun.rise} set={sun.set} wide={wide} label={horizonLabel} />
        <p className="small" style={{ display: 'flex', justifyContent: 'space-between', padding: '.35rem 0 0' }}>
            <span className="mono" style={{ fontSize: '.78em' }}>{formatMinutes(minutes, language)} · Boulder</span>
        </p>
        {status}
        <div className="flow2">
            <div className="flow2__a">
                <div className="o1">
                    {eco && <figure className="photo photo--arch"><img src={gatheringPhoto} alt="" width="900" height="600" /></figure>}
                    {daily ? (
                        <PracticeBlock eyebrow={tr('almanac.practiceEyebrow')} title={localized(daily.title, daily.title_es)}>
                            {localized(daily.body, daily.body_es)}
                        </PracticeBlock>
                    ) : (
                        <section className="practice">
                            <div className="eyebrow">{tr('almanac.practiceEyebrow')}</div>
                            <h1 className="h1 practice__title">{tr('companion.heading')}</h1>
                            <p className="lede">{isLoading ? tr('companion.loading') : tr('almanac.awaiting')}</p>
                        </section>
                    )}
                    {isDone && daily && inFestival && <ObservedRow dateLabel={dateLabel} onReflect={daily.question ? reflect : undefined} />}
                    {wide && actionBar}
                </div>
                <div className="o3">
                    {daily?.question && (
                        <QuestionBlock
                            question={localized(daily.question, daily.question_es)}
                            writing={writing}
                            onWrite={reflect}
                            onShare={() => void shareQuestion(localized(daily.question, daily.question_es))}
                        >{replyForm}</QuestionBlock>
                    )}
                    {!eco && photo}
                </div>
            </div>
            <div className="flow2__b">
                <div className="o2">{next}</div>
                <div className="o4">{later}{questBlock}</div>
            </div>
        </div>
        {!wide && actionBar && <PinnedBar>{actionBar}</PinnedBar>}
    </main>;
}

/** The "I did it" bar is fixed above the tab bar, so the page reserves room for it. */
function PinnedBar({ children }: { children: React.ReactNode }) {
    const { setHasBar } = useShell();
    useEffect(() => { setHasBar(true); return () => setHasBar(false); }, [setHasBar]);
    return <>{children}</>;
}

function QuestsView() {
    const { tr, language } = useLanguage();
    const { data, isLoading, isError } = useCompanionToday();
    const [checks, setChecks] = useState<string[]>(questChecks), [celebrate, setCelebrate] = useState(false);
    const [busy, setBusy] = useState(false), [failedReport, setFailedReport] = useState<string | null>(null), [notice, setNotice] = useState('');
    const completionFocus = useRef<HTMLInputElement | null>(null);
    const localized = (en: string | undefined, es: string | undefined) => language === 'es' ? (es || en || '') : (en || '');

    async function complete(id: string) {
        const next = checks.includes(id) ? checks.filter(k => k !== id) : [...checks, id];
        setChecks(next);
        localSet('cohere-quests', JSON.stringify(next));
        if (!next.includes(id)) return;
        setCelebrate(true);
        await report(id);
    }
    async function report(id: string) {
        setBusy(true); setNotice('reporting'); setFailedReport(null);
        try { await companionRequest('completions', { device_id: anonymousDevice(), quest_id: id }); setNotice(''); }
        catch { setNotice(''); setFailedReport(id); }
        finally { setBusy(false); }
    }

    return <main className="page">
        <Link className="link" to="/today">← {tr('companion.today')}</Link>
        <h1 className="h1" style={{ margin: '.4rem 0 .2rem' }}>{tr('companion.quests')}</h1>
        {isLoading && <p className="small">{tr('companion.loading')}</p>}
        {isError && <p className="small" role="status">{tr('companion.offline')}</p>}
        {notice && <p className="small" role="status">{tr('companion.' + notice)}</p>}
        <section style={{ marginTop: '1rem' }}>
            {data?.quests.length ? data.quests.map(q => <article key={q.id} className="ev" style={{ gridTemplateColumns: '1fr' }}>
                <div>
                    <label className="companion-check"><input type="checkbox" checked={checks.includes(q.id)} onChange={event => { completionFocus.current = event.currentTarget; void complete(q.id); }} /><span className="ev__title">{localized(q.title, q.title_es)}</span></label>
                    <p className="ev__desc">{localized(q.description, q.description_es)}</p>
                    {checks.includes(q.id) && <p className="ev__meta"><span className="tag" data-state="going">{tr('companion.done')}</span></p>}
                    {checks.includes(q.id) && failedReport === q.id && <>
                        <p className="small" role="status">{tr('companion.reportError')}</p>
                        <button type="button" className="btn btn--line btn--sm" disabled={busy} onClick={() => void report(q.id)}>{tr('companion.retryReport')}</button>
                    </>}
                </div>
            </article>) : !isLoading && <p className="lede">{tr('companion.noQuests')}</p>}
        </section>
        <Dialog open={celebrate} onOpenChange={setCelebrate}>
            <DialogPortal><QuestCelebration tr={tr} onDismissFocus={() => completionFocus.current?.focus()} /></DialogPortal>
        </Dialog>
    </main>;
}

function MoreView() {
    const { tr, language } = useLanguage();
    const { data } = useCompanionToday();
    const reminders = useReminders();
    const { ios, installed, prompt, offer } = useInstallOffer();
    const supported = reminderSupport(data?.pushKey) || (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined');
    useEffect(() => () => clearReminderNotice(), []);

    async function enable() {
        if (!data?.pushKey || ios) return;
        await enableReminders(data.pushKey, language);
        // Turning reminders on is one of the two moments the install sheet may appear (once).
        // Only when there is an install to offer: the reminders themselves are already on.
        if (getReminderState().subscribed && prompt) offer('reminders');
    }
    const status = tr('companion.' + (!supported ? 'unsupported' : !data?.pushKey ? 'disabled' : reminders.permission === 'denied' ? 'denied' : reminders.subscribed ? 'enabled' : 'off'));

    return <main className="page">
        <h1 className="h1" style={{ margin: '.8rem 0 .2rem' }}>{tr('companion.more')}</h1>
        {reminders.notice && <p className="small" role="status">{tr('companion.' + reminders.notice)}</p>}
        <section style={{ marginTop: '1.4rem' }}>
            <h2 className="eyebrow">{tr('companion.install')}</h2>
            {installed ? <p style={{ marginTop: '.6rem' }}>{tr('companion.installed')}</p> : ios ? <>
                <p style={{ marginTop: '.6rem' }}>{tr('companion.iosIntro')}</p>
                <ol className="companion-ios"><li><Share aria-hidden="true" />{tr('companion.iosShare')}</li><li><SquarePlus aria-hidden="true" />{tr('companion.iosAdd')}</li><li><Smartphone aria-hidden="true" />{tr('companion.iosOpen')}</li></ol>
            </> : <>
                {!prompt && <p style={{ marginTop: '.6rem' }}>{tr('companion.manual')}</p>}
                <button type="button" className="link" style={{ marginTop: '.4rem' }} onClick={() => offer('manual')}>{tr('almanac.installRow')}</button>
            </>}
        </section>
        <section style={{ marginTop: '1.4rem' }}>
            <h2 className="eyebrow">{tr('companion.notifications')}</h2>
            <p style={{ marginTop: '.6rem' }}>{tr('companion.schedule')}</p>
            <p style={{ marginTop: '.4rem' }}>{status}</p>
            <div style={{ display: 'flex', gap: '.8rem', flexWrap: 'wrap', marginTop: '.6rem' }}>
                {supported && data?.pushKey && reminders.permission !== 'denied' && !ios && !reminders.subscribed && <button type="button" className="btn btn--primary" onClick={() => void enable()} disabled={reminders.busy}>{tr('companion.enable')}</button>}
                {(reminders.subscribed || localGet('cohere-push-off') !== 'true') && <button type="button" className="btn btn--line" onClick={() => void disableReminders()} disabled={reminders.busy}>{tr('companion.disable')}</button>}
            </div>
        </section>
        <section style={{ marginTop: '1.4rem' }}>
            <p className="small">{tr('companion.privacy')}</p>
            <p style={{ marginTop: '.8rem' }}><Link className="link" to="/">{tr('companion.back')}</Link></p>
        </section>
    </main>;
}
