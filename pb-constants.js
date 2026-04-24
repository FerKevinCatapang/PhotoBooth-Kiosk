// ─── REPLACE THIS WITH YOUR OWN GOOGLE OAUTH CLIENT ID ───────────────────────
// 1. Go to console.cloud.google.com → APIs & Services → Credentials
// 2. Create OAuth 2.0 Client ID → Web application
// 3. Add your site URL (or http://localhost) as an Authorized JS Origin
// 4. Paste the Client ID below — users can also override it in the Drive panel UI
const GOOGLE_DRIVE_CLIENT_ID = '1005976603326-rdevbnd8dgg3dd7844cgrkuv07hf1o05.apps.googleusercontent.com';
// ─────────────────────────────────────────────────────────────────────────────

// Built-in prompt question sets for VG mode (admin can add custom ones per session)
const PROMPT_TEMPLATES = {
    wedding: [
        'What is your favorite memory of us as a couple?',
        'What was the most beautiful or memorable moment of the ceremony today?',
        'If you could grant us one wish for our future together, what would it be?',
        'What do you think is the absolute secret to a long and happy marriage?',
        'What is the one thing you will never forget about this wedding?'
    ],
    birthday: [
        "What's your best memory with the birthday person?",
        'What do you wish for them on this special day?',
        'What word best describes the birthday celebrant, and why?',
        'Tell us about the first time you met the birthday person.',
        'What is the funniest moment you have shared with the birthday celebrant?',
        'What is one thing you have always wanted to tell them but never had the chance?',
        'How has the birthday celebrant made a positive impact on your life?',
        'If you could give them any gift in the world, what would it be and why?',
        "Share a piece of advice for the birthday celebrant's next chapter in life."
    ],
    teambuilding: [
        'Share one thing you have learned from a colleague this past year.',
        "What's one quality in a teammate that you truly admire?",
        'Describe your dream team project in one sentence.',
        'What does teamwork mean to you?',
        'Share a moment when your team pulled through a tough challenge.',
        'What is one thing you wish your team knew about you?',
        'If your team were a superhero squad, what would your power be?',
        "What's one team memory that stands out above the rest?",
        "What's one thing you'd like to improve about how we work together?"
    ]
};

// --- Canon Selphy CP1500 compatible paper sizes ---
// wPx/hPx  = source composition canvas at 300 DPI
// pWpx/pHpx = physical Selphy paper canvas at 300 DPI
// twoUp     = print 2 strips side-by-side on Wide paper (2×6 only)
const PAPER_SIZES = {
    '2x6':  { wPx: 600,  hPx: 1800, pWpx: 1200, pHpx: 2400, cssW: '4in', cssH: '8in',  label: '2×6 in Strip',      twoUp: true,  selphy: 'Wide paper (KW-24IP) · 2 strips per sheet, cut in half'  },
    '4x6':  { wPx: 1200, hPx: 1800, pWpx: 1200, pHpx: 1800, cssW: '4in', cssH: '6in',  label: '4×6 in Portrait',    twoUp: false, selphy: 'Postcard paper (KP-108IN) · Selphy CP1500 native ✓'       },
    '4x6l': { wPx: 1800, hPx: 1200, pWpx: 1800, pHpx: 1200, cssW: '6in', cssH: '4in',  label: '4×6 in Landscape',   twoUp: false, selphy: 'Postcard paper (KP-108IN) landscape · Selphy CP1500 ✓'    },
    '5x7':  { wPx: 1500, hPx: 2100, pWpx: 1200, pHpx: 1800, cssW: '4in', cssH: '6in',  label: '5×7 in Portrait',    twoUp: false, selphy: 'Scaled to fit Selphy postcard (4×6) paper'                },
    '6x8':  { wPx: 1800, hPx: 2400, pWpx: 1200, pHpx: 2400, cssW: '4in', cssH: '8in',  label: '6×8 in Portrait',    twoUp: false, selphy: 'Scaled to fit Selphy Wide (4×8) paper'                    },
};

// Layout definitions: source canvas size + photo grid + Selphy paper target
const LAYOUT_DEFS = {
    '2x6-2':  { pW: 600,  pH: 1800, cols: 1, rows: 2, paper: '2x6',  name: '2×6 Strip · 2 photos'         },
    '2x6-3':  { pW: 600,  pH: 1800, cols: 1, rows: 3, paper: '2x6',  name: '2×6 Strip · 3 photos'         },
    '4x6-1':  { pW: 1200, pH: 1800, cols: 1, rows: 1, paper: '4x6',  name: '4×6 Portrait · 1 photo',       square: false },
    '4x6-2':  { pW: 1200, pH: 1800, cols: 1, rows: 2, paper: '4x6',  name: '4×6 Portrait · 2 photos'      },
    '4x6-4':  { pW: 1200, pH: 1800, cols: 2, rows: 2, paper: '4x6',  name: '4×6 Portrait · 4 photos'      },
    '4x6l-1': { pW: 1800, pH: 1200, cols: 1, rows: 1, paper: '4x6l', name: '4×6 Landscape · 1 photo',      square: false },
    '4x6l-2': { pW: 1800, pH: 1200, cols: 2, rows: 1, paper: '4x6l', name: '4×6 Landscape · 2 photos'                  },
    '4x6l-3': { pW: 1800, pH: 1200, cols: 3, rows: 1, paper: '4x6l', name: '4×6 Landscape · 3 photos',     square: false },
    '5x7-1':  { pW: 1500, pH: 2100, cols: 1, rows: 1, paper: '5x7',  name: '5×7 Portrait · 1 photo',       square: false },
    '5x7-2':  { pW: 1500, pH: 2100, cols: 1, rows: 2, paper: '5x7',  name: '5×7 Portrait · 2 photos'      },
    '6x8-1':  { pW: 1800, pH: 2400, cols: 1, rows: 1, paper: '6x8',  name: '6×8 Portrait · 1 photo',       square: false },
    '6x8-4':  { pW: 1800, pH: 2400, cols: 2, rows: 2, paper: '6x8',  name: '6×8 Portrait · 4 photos'      },
};
