"""The T-399 walkthrough: what was blank, what shows now. Vertical, phone size, on the real sites: production for
the blank calendar it still shows, staging for the fix. Read-only on both. Run with the video-lab venv:

    film.py capture     steps through the real pages and screenshots them
    film.py render      draws the film to walkthrough/calendar-keeps-the-festival.mp4
"""
import os
import sys
from pathlib import Path

sys.dont_write_bytecode = True
LAB = Path.home() / 'Code/unforced-media/video-lab'
sys.path.insert(0, str(LAB / 'tools'))
import kit  # noqa: E402
import walkfilm  # noqa: E402
from wordlock import Voice  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = Path(os.environ.get('FILM_OUT', '/tmp/t399/film'))
CAP = OUT / 'cap'
W, H, FPS = 720, 1280, 24
PROD = 'https://cohereboulder.org'
STAGING = 'https://cohere-signup-staging.unforced.workers.dev'


def nav(url, wait=6000):
    return {'js': f"setTimeout(() => {{ location.href = '{url}' }}, 30)", 'wait': wait}


STEPS = [
    {'id': 'blank', 'js': 'new Promise((r) => setTimeout(r, 3000))', 'mark': 'iframe', 'quiet': True, 'after': 300},
    {'id': 'after', **nav(f'{STAGING}/calendar'), 'mark': '[data-testid=calendar-happened] h2', 'after': 300},
    {'id': 'days', 'scroll': '#g-2026-10-17', 'after': 300},
    {'id': 'pick', 'scroll': '#trail', 'tap': '[role=option][aria-label*="Oct 23"]', 'after': 900},
    {'id': 'open', 'tap': '[data-testid=event-card] a:has-text("CreativeMornings Boulder")', 'after': 2500},
    {'id': 'story', 'mark': '.eyebrow:has-text("About")', 'quiet': True, 'after': 300},
    {'id': 'homenav', **nav(f'{STAGING}/')},
    {'id': 'home', 'scroll': '[data-testid=home-happened]', 'mark': '[data-testid=home-happened] h2', 'quiet': True, 'after': 300},
    {'id': 'calnav', **nav(f'{STAGING}/calendar')},
    {'id': 'next', 'mark': '[data-testid=calendar-happened] .small', 'after': 300},
]
V = Voice([
    ('blank', "Here's the [blank]COhere calendar today. The festival is over, so all it says is no upcoming events.", {'gap': .8}),
    ('after', 'Now it [after]remembers. COhere 2026 happened, October fifteenth to the twenty-fifth.', {'gap': .6}),
    ('days', 'All [days]forty-seven gatherings are here, day by day.', {'gap': .6}),
    ('pick', 'Tap a [pick]day, and you see just that day.', {'gap': .6}),
    ('open', 'Tap an [open]event, and it opens, with its description and its place.', {'gap': .5}),
    ('story', 'The [story]RSVP button is gone, since it already happened.', {'gap': .7}),
    ('home', 'The [home]home page looks back too, from the opening to the closing.', {'gap': .7}),
    ('next', 'And when something [next]new goes on the calendar, it comes first, with the festival below it.', {'gap': .7}),
    ('end', 'This is on staging now. Production waits for Aaron's go.', {'gap': .4}),
], OUT / 'vo')
DUR = V.duration + 1.2
SHOTS = ['blank', 'after', 'days', 'pick', 'open', 'story', 'home', 'next']


def shots():
    rows = []
    for k, i in enumerate(SHOTS):
        at = V.at(i)
        nxt = V.at(SHOTS[k + 1]) - .8 if k + 1 < len(SHOTS) else DUR
        rows.append((i, at, min(V.lines[i]['end'] + .5, nxt)))
    return rows


if __name__ == '__main__':
    if sys.argv[1] == 'capture':
        walkfilm.capture(f'{PROD}/calendar', STEPS, CAP)
    else:
        print('duration', DUR)
        F = walkfilm.Film(CAP, shots())
        bed = Path.home() / '.local/share/uni/media-studio/beds/lantern_hymn_sparse.wav'
        wav = kit.write_wav(OUT / 'mix.wav', kit.mix_voice_bed(V.placed, DUR, bed))
        kit.render(F.frame, DUR, Path(sys.argv[2]) if len(sys.argv) > 2 else HERE / 'calendar-keeps-the-festival.mp4', W, H, FPS, wav, workers=4, crf=23)
