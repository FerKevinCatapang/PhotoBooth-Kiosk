let currentStream = null;
let directoryHandle = null;
let vgDirectoryHandle = null;

let capturedPhotos = [];           // In-memory database of captured session photos
let capturedPhotoDriveLinks = [];  // parallel: Drive share URL for each photo, or null
let capturedVideos = [];           // In-memory database of captured video guestbook blob URLs
let capturedVideoDriveLinks = [];  // parallel: Drive share URL for each video, or null

let appConfig = {
    layout: '4x6-1',
    saveLocal: true,          // PB: save to local folder
    saveDrive: false,         // PB: upload to Google Drive
    countdownFirst: 5,
    countdownOthers: 5,
    reviewTime: 4,
    welcomeBg: '#E0F2FE',
    welcomeTitle: '',
    welcomeSubtitle: '',
    welcomeMedia: null,   // { type: 'image'|'video', objectUrl: string } or null
    photoMode: false,
    // Capture mode: 'photobooth' | 'videoguestbook'
    captureMode: 'photobooth',
    // Video Guestbook settings
    vgMaxDuration: 60,        // max recording seconds
    vgPromptText: '',
    vgCountdown: 3,           // countdown before recording starts
    vgSelectedCameraId: '',   // VG-specific camera device ID
    vgFacingMode: 'user',     // VG-specific facing mode
    vgSelectedMicId: '',      // VG-specific microphone device ID ('' = browser default)
    vgSelectedSpeakerId: '',  // VG-specific audio output device ID ('' = browser default)
    vgSaveLocal: true,        // VG: save to local folder
    vgSaveDrive: false,       // VG: upload to Google Drive (uses VG-specific Drive config below)
    vgOverlay: null,          // { objectUrl, img } or null — PNG overlay burned into recordings
    // Printer settings
    printCopies: 1,
    printQuality: 'high',
    paperSizeOverride: 'auto',
    colorMode: 'color',
    borderless: true,
    // Template image (set by admin in Photo Template panel)
    templateBg: null,
    // Video Guestbook frame/background image (overlaid on the recording)
    vgFrameBg: null,
    // Show social sharing overlay after each capture
    socialShare: true,
    // Event name used as filename prefix (e.g. "Smiths_Wedding")
    eventName: '',
    // Printing mode:
    //   'dialog'  – system print dialog (window.print)  — works on desktop, iPad AirPrint, Android Chrome
    //   'server'  – POST image to a local WiFi print server (best for tablets/silent kiosk)
    printMode: 'dialog',
    printServer: '',     // e.g. "http://192.168.1.50:3000"
    selectedCameraId: '', // deviceId chosen in Capture Settings
    facingMode: 'user',   // 'user' = front cam, 'environment' = rear cam, '' = specific device

    // Disclaimer (shared for Photo Booth and Video Guestbook)
    disclaimerEnabled: false,
    disclaimerHeader: 'Media Release Agreement',
    disclaimerOrg: 'Name of Organization',
    disclaimerText: 'By proceeding, I grant {Name of Organization} the right to use my photos or videos from this event for promotional and publication purposes without compensation. I understand these files become the property of the organization, and I waive the right to review the final media or claim royalties. I also release {Name of Organization} from any legal claims or liability related to the use of my likeness.',
    // Google Drive — Photo Booth (Method A - browser OAuth)
    driveFolderName: 'Photo Booth Captures',
    _driveAccessToken: null,
    _driveFolderId: null,       // cached ID of the root PB folder
    _driveEventFolderId: null,  // cached ID of the event sub-folder (reset on eventName change)

    // Google Drive — Video Guestbook (independent credentials)
    vgDriveFolderName: 'Video Guestbook Captures',
    vgDriveClientId: '',
    _vgDriveAccessToken: null,
    _vgDriveFolderId: null,       // cached ID of the root VG folder
    _vgDriveEventFolderId: null,  // cached ID of the event sub-folder (reset on eventName change)

    // Prompts — Video Guestbook
    vgPromptsEnabled: false,
    vgPromptCategory: 'wedding', // 'wedding' | 'birthday' | 'teambuilding'
    vgCustomPrompts: [],          // admin-added prompts appended to the active template pool

    // Preview after recording — Video Guestbook
    vgPreviewEnabled: true,       // show the video playback overlay after each recording

    // Thank You screen — Video Guestbook
    vgThankYouEnabled: false,
    vgThankYouImage: null,        // { objectUrl: string } or null — custom background image
    vgThankYouDuration: 5,        // seconds before auto-advancing to welcome screen
};

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

// Returns the active Client ID: UI input field takes priority, falls back to the hardcoded constant
function _getDriveClientId() {
    const el = document.getElementById('drive-client-id');
    const inputVal = el ? el.value.trim() : '';
    return inputVal || GOOGLE_DRIVE_CLIENT_ID;
}

// --- Filename generator: eventName_YYYYMMDD_HHMMSS.png ---
function makeFilename() {
    const now = new Date();
    const ts = now.getFullYear()
        + String(now.getMonth() + 1).padStart(2, '0')
        + String(now.getDate()).padStart(2, '0')
        + '_'
        + String(now.getHours()).padStart(2, '0')
        + String(now.getMinutes()).padStart(2, '0')
        + String(now.getSeconds()).padStart(2, '0');
    const prefix = appConfig.eventName
        ? appConfig.eventName.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
        : 'photobooth';
    return `${prefix}_${ts}.png`;
}

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

$(document).ready(function() {

    updateDashboardGallery();

    // --- Tabs ---
    $('.nav-item').on('click', function(e) {
        e.preventDefault();
        $('.nav-item').removeClass('active');
        $(this).addClass('active');
        $('.admin-panel').hide();
        $('#' + $(this).data('target')).show();
    });

    // --- Dynamic Slider Syncing ---
    $('#setting-cd-1').on('input', function() {
        let val = $(this).val();
        $('#val-cd-1').text(val);
        appConfig.countdownFirst = parseInt(val);
    });
    
    $('#setting-cd-others').on('input', function() {
        let val = $(this).val();
        $('#val-cd-others').text(val);
        appConfig.countdownOthers = parseInt(val);
    });

    $('#setting-review').on('input', function() {
        let val = $(this).val();
        $('#val-review').text(val);
        appConfig.reviewTime = parseInt(val);
    });

    // --- Storage (Photo Booth) — checkbox toggles (both local + drive can be active) ---
    $('#chk-save-local').on('change', function() {
        appConfig.saveLocal = this.checked;
        if (this.checked) {
            $('#local-folder-config').slideDown();
        } else {
            $('#local-folder-config').slideUp();
        }
    });

    $('#chk-save-drive').on('change', function() {
        appConfig.saveDrive = this.checked;
        if (this.checked) {
            $('#pb-drive-config').slideDown();
        } else {
            $('#pb-drive-config').slideUp();
        }
        _updateEventNameWarnings();
    });

    $('#btn-select-dir').on('click', async function() {
        try {
            if (!window.showDirectoryPicker) {
                alert("Your browser does not support seamless folder saving. Photos will be saved via standard downloads.");
                return;
            }
            directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            const label = `Saving to: /${directoryHandle.name}`;
            $('#dir-status').text(label);
            $('#wiz-dir-status').text(label);
        } catch (err) {
            console.log("Directory picker cancelled or failed.", err);
        }
    });

    // --- Welcome Screen Designer ---
    $('#edit-bg-color').on('input', function() {
        let col = $(this).val();
        appConfig.welcomeBg = col;
        $('#color-hex').text(col);
        // Only apply color when no media is active
        if (!appConfig.welcomeMedia) {
            $('#designer-preview').css('background-color', col);
            $('#guest-welcome').css('background-color', col);
        }
    });

    $('#edit-title').on('input', function() {
        let txt = $(this).val();
        appConfig.welcomeTitle = txt;
        $('#prev-title').text(txt);
        $('#live-ws-title').text(txt);
    });

    $('#edit-subtitle').on('input change', function() {
        let txt = $(this).val();
        appConfig.welcomeSubtitle = txt;
        $('#prev-subtitle').text(txt);
        $('#live-ws-subtitle').text(txt);
    });

    // --- Welcome Screen Media Upload ---
    function applyWelcomeMedia(file) {
        if (appConfig.welcomeMedia) {
            URL.revokeObjectURL(appConfig.welcomeMedia.objectUrl);
        }
        const objectUrl = URL.createObjectURL(file);
        const type = file.type.startsWith('video/') ? 'video' : 'image';
        appConfig.welcomeMedia = { type, objectUrl };

        // Update upload zone thumb
        const thumbWrap = $('#ws-media-thumb-wrap').empty();
        if (type === 'video') {
            thumbWrap.html(`<video src="${objectUrl}" class="ws-thumb-media" autoplay loop muted playsinline></video>`);
        } else {
            thumbWrap.html(`<img src="${objectUrl}" class="ws-thumb-media">`);
        }
        $('#ws-media-empty').hide();
        $('#ws-media-filled').show();

        // Update designer preview frame
        if (type === 'video') {
            $('#prev-media-img').hide().attr('src', '');
            const pv = $('#prev-media-video').attr('src', objectUrl).show()[0];
            pv.load(); pv.play();
        } else {
            $('#prev-media-video').hide().attr('src', '')[0].load();
            $('#prev-media-img').attr('src', objectUrl).show();
        }
        $('#designer-preview').css('background-color', '');

        // Update kiosk welcome screen
        if (type === 'video') {
            $('#ws-image-bg').hide().attr('src', '');
            const kv = $('#ws-video-bg').attr('src', objectUrl).show()[0];
            kv.load(); kv.play();
        } else {
            $('#ws-video-bg').hide().attr('src', '')[0].load();
            $('#ws-image-bg').attr('src', objectUrl).show();
        }
        $('#guest-welcome').css('background-color', '');
    }

    function clearWelcomeMedia() {
        if (appConfig.welcomeMedia) {
            URL.revokeObjectURL(appConfig.welcomeMedia.objectUrl);
            appConfig.welcomeMedia = null;
        }
        // Reset preview
        $('#prev-media-img').hide().attr('src', '');
        const pv = $('#prev-media-video').hide().attr('src', '')[0];
        if (pv) { pv.load(); }
        $('#designer-preview').css('background-color', appConfig.welcomeBg);
        // Reset kiosk
        $('#ws-image-bg').hide().attr('src', '');
        const kv = $('#ws-video-bg').hide().attr('src', '')[0];
        if (kv) { kv.load(); }
        $('#guest-welcome').css('background-color', appConfig.welcomeBg);
        // Reset upload zone
        $('#ws-media-empty').show();
        $('#ws-media-filled').hide();
        $('#ws-media-thumb-wrap').empty();
        $('#ws-media-input').val('');
    }

    // Click on upload zone opens file picker
    $('#ws-media-drop').on('click', function(e) {
        if (!$(e.target).closest('#ws-media-remove, #btn-pick-ws-media').length) {
            document.getElementById('ws-media-input').click();
        }
    });
    // Dedicated Choose File button — native .click() so the browser trusts it as a real user gesture
    $('#btn-pick-ws-media').on('click', function(e) {
        e.stopPropagation();
        document.getElementById('ws-media-input').click();
    });

    // File selected via input
    $('#ws-media-input').on('change', function() {
        const file = this.files[0];
        if (file) applyWelcomeMedia(file);
    });

    // Drag and drop
    $('#ws-media-drop').on('dragover dragenter', function(e) {
        e.preventDefault(); e.stopPropagation();
        $(this).addClass('drag-over');
    }).on('dragleave drop', function(e) {
        e.preventDefault(); e.stopPropagation();
        $(this).removeClass('drag-over');
        if (e.type === 'drop') {
            const file = e.originalEvent.dataTransfer.files[0];
            if (file && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
                applyWelcomeMedia(file);
            }
        }
    });

    // Remove media
    $('#ws-media-remove').on('click', function(e) {
        e.stopPropagation();
        clearWelcomeMedia();
    });

    // --- Photo Mode Toggle ---
    $('#toggle-photo-mode').on('change', function() {
        appConfig.photoMode = $(this).is(':checked');
        const label = appConfig.photoMode ? 'ON' : 'OFF';
        $('#toggle-photo-label').text(label);
        $(this).closest('.toggle-switch').toggleClass('is-on', appConfig.photoMode);
    });

    // --- Social Share Toggle ---
    $('#toggle-social-share').on('change', function() {
        appConfig.socialShare = this.checked;
        $('#toggle-social-label').text(this.checked ? 'ON' : 'OFF');
        $(this).closest('.toggle-switch').toggleClass('is-on', this.checked);
    });
    // Initialize social share toggle state
    $('#toggle-social-share').prop('checked', appConfig.socialShare).closest('.toggle-switch').toggleClass('is-on', appConfig.socialShare);
    $('#toggle-social-label').text(appConfig.socialShare ? 'ON' : 'OFF');

    // --- Disclaimer — helpers ---
    const DEFAULT_DISCLAIMER_TEXT = appConfig.disclaimerText;

    function _renderDisclaimerText(text, org) {
        return text.replace(/\{Name of Organization\}/g, org || 'the Organisation');
    }

    // --- Disclaimer — shared admin settings ---
    (function initDisclaimer() {
        $('#disclaimer-header').val(appConfig.disclaimerHeader);
        $('#disclaimer-org').val(appConfig.disclaimerOrg);
        $('#disclaimer-text').val(appConfig.disclaimerText);

        function _sync() {
            const on = appConfig.disclaimerEnabled;
            $('#toggle-disclaimer').prop('checked', on).closest('.toggle-switch').toggleClass('is-on', on);
            $('#toggle-disclaimer-label').text(on ? 'ON' : 'OFF');
            $('#disclaimer-config').toggle(on);
        }
        _sync();

        $('#toggle-disclaimer').on('change', function() {
            appConfig.disclaimerEnabled = this.checked;
            $('#toggle-disclaimer-label').text(this.checked ? 'ON' : 'OFF');
            $(this).closest('.toggle-switch').toggleClass('is-on', this.checked);
            $('#disclaimer-config').toggle(this.checked);
        });
        $('#disclaimer-org').on('input', function() { appConfig.disclaimerOrg = this.value; });
        $('#disclaimer-header').on('input', function() { appConfig.disclaimerHeader = this.value || 'Media Release Agreement'; });
        $('#disclaimer-text').on('input', function() { appConfig.disclaimerText = this.value; });
    })();

    // --- Prompts — Video Guestbook admin settings ---
    (function initVgPrompts() {
        function _renderPromptList() {
            const builtIn = PROMPT_TEMPLATES[appConfig.vgPromptCategory] || [];
            const custom  = appConfig.vgCustomPrompts;
            $('#vg-prompts-count').text('(' + (builtIn.length + custom.length) + ')');

            const $list = $('#vg-prompts-list').empty();
            builtIn.forEach(function(q) {
                $list.append(
                    '<li class="vg-prompt-item">' +
                    '<span class="vg-prompt-badge">Template</span>' +
                    '<span class="vg-prompt-text">' + $('<span>').text(q).html() + '</span>' +
                    '</li>'
                );
            });
            custom.forEach(function(q, i) {
                $list.append(
                    '<li class="vg-prompt-item">' +
                    '<span class="vg-prompt-badge vg-prompt-badge-custom">Custom</span>' +
                    '<span class="vg-prompt-text">' + $('<span>').text(q).html() + '</span>' +
                    '<button class="vg-prompt-del" data-idx="' + i + '" title="Remove">\u2715</button>' +
                    '</li>'
                );
            });
            $('#vg-prompts-list').find('.vg-prompt-del').on('click', function() {
                appConfig.vgCustomPrompts.splice(parseInt($(this).data('idx'), 10), 1);
                _renderPromptList();
            });
        }

        function _syncToggle() {
            const on = appConfig.vgPromptsEnabled;
            $('#toggle-vg-prompts').prop('checked', on).closest('.toggle-switch').toggleClass('is-on', on);
            $('#toggle-vg-prompts-label').text(on ? 'ON' : 'OFF');
            $('#vg-prompts-config').toggle(on);
        }

        _syncToggle();
        _renderPromptList();

        $('#toggle-vg-prompts').on('change', function() {
            appConfig.vgPromptsEnabled = this.checked;
            $('#toggle-vg-prompts-label').text(this.checked ? 'ON' : 'OFF');
            $(this).closest('.toggle-switch').toggleClass('is-on', this.checked);
            $('#vg-prompts-config').toggle(this.checked);
        });

        $(document).on('click', '.prompt-cat-btn', function() {
            const cat = $(this).data('cat');
            appConfig.vgPromptCategory = cat;
            $('.prompt-cat-btn').removeClass('active');
            $(this).addClass('active');
            _renderPromptList();
        });

        function _addCustomPrompt() {
            const val = $('#vg-custom-prompt-input').val().trim();
            if (!val) return;
            appConfig.vgCustomPrompts.push(val);
            $('#vg-custom-prompt-input').val('');
            _renderPromptList();
        }

        $('#btn-add-vg-prompt').on('click', _addCustomPrompt);
        $('#vg-custom-prompt-input').on('keydown', function(e) {
            if (e.key === 'Enter') _addCustomPrompt();
        });
    })();

    // --- Thank You Screen — Video Guestbook admin settings ---
    (function initVgThankYou() {
        function _syncToggle() {
            const on = appConfig.vgThankYouEnabled;
            $('#toggle-vg-thankyou').prop('checked', on).closest('.toggle-switch').toggleClass('is-on', on);
            $('#toggle-vg-thankyou-label').text(on ? 'ON' : 'OFF');
            $('#vg-thankyou-config').toggle(on);
            // Show/hide nav item (only relevant in VG mode)
            const isVg = appConfig.captureMode === 'videoguestbook';
            $('#nav-vg-thankyou').toggle(isVg);
        }

        function _applyTyImage(file) {
            if (appConfig.vgThankYouImage) {
                URL.revokeObjectURL(appConfig.vgThankYouImage.objectUrl);
            }
            const objectUrl = URL.createObjectURL(file);
            appConfig.vgThankYouImage = { objectUrl };

            // Thumb in upload zone
            $('#ty-media-thumb-wrap').html('<img src="' + objectUrl + '" style="width:100%; height:100%; object-fit:cover;">');
            $('#ty-media-empty').hide();
            $('#ty-media-filled').show();

            // Preview frame
            $('#ty-preview-bg').attr('src', objectUrl).show();
            $('#ty-preview-frame').addClass('has-bg');
        }

        function _clearTyImage() {
            if (appConfig.vgThankYouImage) {
                URL.revokeObjectURL(appConfig.vgThankYouImage.objectUrl);
                appConfig.vgThankYouImage = null;
            }
            $('#ty-media-thumb-wrap').empty();
            $('#ty-media-filled').hide();
            $('#ty-media-empty').show();
            $('#ty-media-input').val('');
            $('#ty-preview-bg').attr('src', '').hide();
            $('#ty-preview-frame').removeClass('has-bg');
        }

        // Duration slider
        $('#setting-ty-duration').val(appConfig.vgThankYouDuration).on('input', function() {
            appConfig.vgThankYouDuration = parseInt(this.value, 10);
            $('#val-ty-duration').text(this.value);
        });
        $('#val-ty-duration').text(appConfig.vgThankYouDuration);

        // Toggle
        _syncToggle();
        $('#toggle-vg-thankyou').on('change', function() {
            appConfig.vgThankYouEnabled = this.checked;
            $('#toggle-vg-thankyou-label').text(this.checked ? 'ON' : 'OFF');
            $(this).closest('.toggle-switch').toggleClass('is-on', this.checked);
            $('#vg-thankyou-config').toggle(this.checked);
        });

        // File picker
        $('#ty-media-drop').on('click', function(e) {
            if ($(e.target).closest('#ty-media-remove, #ty-media-filled').length) return;
            document.getElementById('ty-media-input').click();
        });
        $('#btn-pick-ty-media').on('click', function(e) {
            e.stopPropagation();
            document.getElementById('ty-media-input').click();
        });
        $('#ty-media-input').on('change', function() {
            const file = this.files[0];
            if (file) _applyTyImage(file);
        });
        $('#ty-media-drop').on('dragover dragenter', function(e) {
            e.preventDefault(); e.stopPropagation();
            $(this).addClass('drag-over');
        }).on('dragleave dragend drop', function(e) {
            e.preventDefault(); e.stopPropagation();
            $(this).removeClass('drag-over');
            if (e.type === 'drop') {
                const file = e.originalEvent.dataTransfer.files[0];
                if (file && file.type.startsWith('image/')) _applyTyImage(file);
            }
        });
        $('#ty-media-remove').on('click', function(e) {
            e.stopPropagation();
            _clearTyImage();
        });

        // Keep nav item visibility in sync when capture mode changes
        $(document).on('capturemode:change', function() {
            $('#nav-vg-thankyou').toggle(appConfig.captureMode === 'videoguestbook' && appConfig.vgThankYouEnabled);
        });
    })();
    // Opens the disclaimer modal; resolves true (accepted) or false (rejected)
    function showDisclaimerDialog(header, text, org) {
        return new Promise(resolve => {
            const rendered = _renderDisclaimerText(text, org);
            $('#disclaimer-modal-title').text(header || 'Do you agree with the terms?');
            // Convert newlines to paragraphs
            const html = rendered.split(/\n\n+/).map(p => `<p>${$('<div>').text(p.trim()).html()}</p>`).join('');
            $('#disclaimer-modal-body').html(html);
            $('#disclaimer-overlay').css('display', 'flex');

            function cleanup() {
                $('#disclaimer-overlay').hide();
                $('#btn-disclaimer-accept, #btn-disclaimer-reject').off('click.disc');
            }
            $('#btn-disclaimer-accept').one('click.disc', function() { cleanup(); resolve(true); });
            $('#btn-disclaimer-reject').one('click.disc', function() { cleanup(); resolve(false); });
        });
    }

    // --- Share Button Handlers ---
    $('#btn-share-done').on('click', hideShareOverlay);

    $('#btn-share-download').on('click', function() {
        const a = document.createElement('a');
        a.href = $('#share-preview-img').attr('src');
        a.download = makeFilename();
        a.click();
    });

    $('#btn-share-native').on('click', async function() {
        if (!_shareObjectUrl) return;
        try {
            const resp = await fetch(_shareObjectUrl);
            const blob = await resp.blob();
            const file = new File([blob], makeFilename(), { type: 'image/png' });
            await navigator.share({ files: [file], title: 'My Photo Booth Picture' });
        } catch (err) {
            if (err.name !== 'AbortError') console.warn('Web Share failed:', err);
        }
    });

    $('#btn-share-whatsapp').on('click', function() {
        const a = document.createElement('a');
        a.href = $('#share-preview-img').attr('src');
        a.download = makeFilename();
        a.click();
        setTimeout(() => window.open('https://wa.me/', '_blank'), 600);
    });

    $('#btn-share-facebook').on('click', function() {
        window.open('https://www.facebook.com/', '_blank');
    });

    $('#btn-share-x').on('click', function() {
        window.open('https://x.com/', '_blank');
    });

    $('#btn-share-email').on('click', function() {
        const a = document.createElement('a');
        a.href = $('#share-preview-img').attr('src');
        a.download = makeFilename();
        a.click();
        const sub  = encodeURIComponent('Check out my photo booth picture!');
        const body = encodeURIComponent('I just took this awesome photo at the booth!');
        setTimeout(() => { window.location.href = `mailto:?subject=${sub}&body=${body}`; }, 600);
    });

    // --- Printer Setup ---
    $('input[name="paper-size"]').on('change', function() {
        appConfig.paperSizeOverride = $(this).val();
        updatePaperMappingInfo();
    });

    $('#btn-copies-up').on('click', function() {
        appConfig.printCopies = Math.min(10, appConfig.printCopies + 1);
        $('#print-copies-display').text(appConfig.printCopies);
    });

    $('#btn-copies-down').on('click', function() {
        appConfig.printCopies = Math.max(1, appConfig.printCopies - 1);
        $('#print-copies-display').text(appConfig.printCopies);
    });

    $('input[name="color-mode"]').on('change', function() {
        appConfig.colorMode = $(this).val();
    });

    $('input[name="print-quality"]').on('change', function() {
        appConfig.printQuality = $(this).val();
    });

    $('#toggle-borderless').on('change', function() {
        appConfig.borderless = $(this).is(':checked');
        $('#toggle-borderless-label').text(appConfig.borderless ? 'ON' : 'OFF');
        $(this).closest('.toggle-switch').toggleClass('is-on', appConfig.borderless);
    });

    $('#btn-test-print').on('click', async function() {
        $(this).prop('disabled', true).text('Printing…');
        await printTestPage();
        $(this).prop('disabled', false).text('Test Print');
    });

    // --- Print Mode (dialog vs server) ---
    $('input[name="print-mode"]').on('change', function() {
        appConfig.printMode = this.value;
        const serverMode = this.value === 'server';
        $('#print-server-config').toggle(serverMode);
        // Update the radio label borders
        $('input[name="print-mode"]').each(function() {
            $(this).closest('label').css('border-color', this.checked ? '#be185d' : '#e5e7eb')
                                    .css('background', this.checked ? '#fdf2f8' : '');
        });
    });

    $('#print-server-url').on('input', function() {
        appConfig.printServer = this.value.trim();
    });

    $('#btn-test-server').on('click', async function() {
        const btn = $(this);
        const msg = $('#server-status-msg');
        if (!appConfig.printServer) {
            msg.text('⚠ Enter a server URL first.').css('color', '#d97706').show();
            return;
        }
        btn.prop('disabled', true).text('Testing…');
        msg.hide();
        try {
            const data = await checkPrintServer();
            msg.html('✅ Connected — ' + (data.printer || data.server || 'server ready')).css('color', '#16a34a').show();
        } catch (e) {
            msg.html('❌ Could not reach server: ' + e.message).css('color', '#dc2626').show();
        } finally {
            btn.prop('disabled', false).text('Test Connection');
        }
    });

    // Keep paper info synced when layout changes
    $('input[name="layout"]').on('change', function() {
        updatePaperMappingInfo();
        updateTemplateSizeHint();
    });
    updatePaperMappingInfo();
    updateTemplateSizeHint();

    // --- Photo Template Image Upload ---
    async function loadImageFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => {
                const img = new Image();
                img.onload  = () => resolve(img);
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async function applyBgImage(file) {
        try {
            const img = await loadImageFromFile(file);
            appConfig.templateBg = img;
            $('#bg-thumb').attr('src', img.src);
            $('#bg-filename').text(file.name);
            $('#bg-dims').text(img.naturalWidth + ' × ' + img.naturalHeight + ' px');
            $('#bg-empty-state').hide();
            $('#bg-preview-state').show();
            drawTemplatePreview();
        } catch(e) { console.error('Failed to load background image', e); }
    }

    $('#btn-pick-bg').on('click', function(e) { e.stopPropagation(); document.getElementById('upload-template-bg').click(); });
    $('#bg-empty-state').on('click', function(e) {
        if (!$(e.target).is('button')) $('#upload-template-bg').click();
    });
    $('#upload-template-bg').on('change', async function() {
        if (this.files[0]) await applyBgImage(this.files[0]);
        this.value = '';
    });
    $('#btn-clear-bg').on('click', function() {
        appConfig.templateBg = null;
        $('#bg-preview-state').hide();
        $('#bg-empty-state').show();
        drawTemplatePreview();
    });

    // Drag-and-drop on background upload zone
    const bgZone = document.getElementById('bg-upload-zone');
    if (bgZone) {
        bgZone.addEventListener('dragover', e => { e.preventDefault(); bgZone.classList.add('drag-over'); });
        bgZone.addEventListener('dragleave', () => bgZone.classList.remove('drag-over'));
        bgZone.addEventListener('drop', async e => {
            e.preventDefault();
            bgZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (!file || !file.type.match(/image\/(jpeg|png)/)) return;
            await applyBgImage(file);
        });
    }

    // =====================================================================
    // GOOGLE DRIVE — Method A (Browser OAuth via Google Identity Services)
    // =====================================================================

    const DRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.file';

    function _driveSetStatus(msg, isError) {
        const el = document.getElementById('drive-auth-status');
        if (!el) return;
        el.textContent = msg;
        el.style.color = isError ? '#ef4444' : '#16a34a';
    }

    // Request an access token via the GIS token client
    function _driveRequestToken() {
        return new Promise((resolve, reject) => {
            const clientId = _getDriveClientId();
            if (!clientId || clientId.startsWith('YOUR_CLIENT')) {
                reject(new Error('No Client ID configured.'));
                return;
            }
            const client = google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: DRIVE_SCOPES,
                callback: (resp) => {
                    if (resp.error) { reject(new Error(resp.error)); return; }
                    appConfig._driveAccessToken = resp.access_token;
                    appConfig._driveFolderId = null; // reset folder cache on new token
                    resolve(resp.access_token);
                }
            });
            client.requestAccessToken({ prompt: '' });
        });
    }

    // Ensure we have a valid token (re-request silently if missing)
    async function _driveEnsureToken() {
        if (appConfig._driveAccessToken) return appConfig._driveAccessToken;
        return _driveRequestToken();
    }

    // Find or create the root PB folder; returns folderId
    async function _driveEnsureFolder(token) {
        if (appConfig._driveFolderId) return appConfig._driveFolderId;
        const folderName = appConfig.driveFolderName || 'Photo Booth Captures';
        // Search for existing folder
        const query = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${folderName.replace(/'/g,"\\'")}' and trashed=false`);
        const searchResp = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
            headers: { Authorization: 'Bearer ' + token }
        });
        const searchData = await searchResp.json();
        if (searchData.files && searchData.files.length > 0) {
            appConfig._driveFolderId = searchData.files[0].id;
            return appConfig._driveFolderId;
        }
        // Create the root folder
        const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder' })
        });
        const folder = await createResp.json();
        appConfig._driveFolderId = folder.id;
        return folder.id;
    }

    // Find or create the event sub-folder inside the root PB folder; returns its folderId
    async function _driveEnsureEventFolder(token) {
        if (appConfig._driveEventFolderId) return appConfig._driveEventFolderId;
        const parentId = await _driveEnsureFolder(token);
        const subName = appConfig.eventName ? appConfig.eventName.trim() : 'Default Event';
        const query = encodeURIComponent(
            `mimeType='application/vnd.google-apps.folder' and name='${subName.replace(/'/g,"\\'")}' and '${parentId}' in parents and trashed=false`
        );
        const searchResp = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
            headers: { Authorization: 'Bearer ' + token }
        });
        const searchData = await searchResp.json();
        if (searchData.files && searchData.files.length > 0) {
            appConfig._driveEventFolderId = searchData.files[0].id;
            return appConfig._driveEventFolderId;
        }
        const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: subName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
        });
        const sub = await createResp.json();
        appConfig._driveEventFolderId = sub.id;
        return sub.id;
    }

    // Upload a Blob to Drive inside the event sub-folder
    async function uploadToDrive(blob, filename) {
        try {
            const token = await _driveEnsureToken();
            const folderId = await _driveEnsureEventFolder(token);
            const meta = JSON.stringify({ name: filename, parents: [folderId] });
            const form = new FormData();
            form.append('metadata', new Blob([meta], { type: 'application/json' }));
            form.append('file', blob, filename);
            const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + token },
                body: form
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                // Token may have expired — clear and retry once
                if (resp.status === 401) {
                    appConfig._driveAccessToken = null;
                    const token2 = await _driveEnsureToken();
                    const form2 = new FormData();
                    form2.append('metadata', new Blob([meta], { type: 'application/json' }));
                    form2.append('file', blob, filename);
                    const resp2 = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
                        method: 'POST',
                        headers: { Authorization: 'Bearer ' + token2 },
                        body: form2
                    });
                    if (!resp2.ok) throw new Error('Drive upload failed after retry');
                    return resp2.json();
                }
                throw new Error((err.error && err.error.message) || 'Drive upload failed');
            }
            return resp.json();
        } catch (e) {
            console.warn('[Drive] Upload error:', e.message);
            throw e;
        }
    }

    // Upload a video blob using the VG-specific Drive credentials into the event sub-folder
    async function uploadVgToDrive(blob, filename) {
        try {
            const token = await _vgDriveEnsureToken();
            const folderId = await _vgDriveEnsureEventFolder(token);
            const mimeType = blob.type || 'video/webm';
            const meta = JSON.stringify({ name: filename, parents: [folderId] });
            const form = new FormData();
            form.append('metadata', new Blob([meta], { type: 'application/json' }));
            form.append('file', blob, filename);
            const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + token },
                body: form
            });
            if (!resp.ok) {
                if (resp.status === 401) {
                    appConfig._vgDriveAccessToken = null;
                    const token2 = await _vgDriveEnsureToken();
                    const form2 = new FormData();
                    form2.append('metadata', new Blob([meta], { type: 'application/json' }));
                    form2.append('file', blob, filename);
                    const resp2 = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
                        method: 'POST',
                        headers: { Authorization: 'Bearer ' + token2 },
                        body: form2
                    });
                    if (!resp2.ok) throw new Error('Drive VG upload failed after retry');
                    return resp2.json();
                }
                throw new Error('Drive VG upload failed');
            }
            return resp.json();
        } catch (e) {
            console.warn('[Drive] VG upload error:', e.message);
            throw e;
        }
    }

    // UI: Folder name input
    $('#drive-folder-name').on('input', function() {
        appConfig.driveFolderName = this.value.trim() || 'Photo Booth Captures';
        appConfig._driveFolderId = null; // reset folder cache
    });

    // UI: Sign in button
    $('#btn-drive-signin').on('click', async function() {
        const btn = $(this);
        const clientId = _getDriveClientId();
        if (!clientId || clientId.startsWith('YOUR_CLIENT')) {
            _driveSetStatus('Enter your Client ID above first.', true);
            return;
        }
        btn.prop('disabled', true).text('Signing in…');
        _driveSetStatus('');
        try {
            await _driveRequestToken();
            _driveSetStatus('✓ Connected — photos will upload automatically', false);
            btn.hide();
            $('#btn-drive-signout').show();
        } catch (e) {
            _driveSetStatus('Sign-in failed: ' + e.message, true);
        } finally {
            btn.prop('disabled', false).text('Sign in with Google');
        }
    });

    // UI: Sign out button
    $('#btn-drive-signout').on('click', function() {
        if (appConfig._driveAccessToken) {
            google.accounts.oauth2.revoke(appConfig._driveAccessToken, () => {});
        }
        appConfig._driveAccessToken = null;
        appConfig._driveFolderId = null;
        $(this).hide();
        $('#btn-drive-signin').show();
        _driveSetStatus('Signed out', false);
    });

    // ─── VIDEO GUESTBOOK — INDEPENDENT GOOGLE DRIVE AUTH ──────────────────────

    function _getVgDriveClientId() {
        const el = document.getElementById('vg-drive-client-id');
        const inputVal = el ? el.value.trim() : '';
        // Fall back to VG config, then PB config, then the hardcoded constant
        return inputVal || appConfig.vgDriveClientId || _getDriveClientId();
    }

    function _vgDriveSetStatus(msg, isErr = false) {
        const el = document.getElementById('vg-drive-auth-status');
        if (el) { el.textContent = msg; el.style.color = isErr ? '#dc2626' : '#6b7280'; }
    }

    async function _vgDriveRequestToken() {
        return new Promise((resolve, reject) => {
            const clientId = _getVgDriveClientId();
            const client = google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: 'https://www.googleapis.com/auth/drive.file',
                callback: (response) => {
                    if (response.error) { reject(new Error(response.error)); return; }
                    appConfig._vgDriveAccessToken = response.access_token;
                    resolve(response.access_token);
                }
            });
            client.requestAccessToken();
        });
    }

    async function _vgDriveEnsureToken() {
        if (appConfig._vgDriveAccessToken) return appConfig._vgDriveAccessToken;
        return _vgDriveRequestToken();
    }

    async function _vgDriveEnsureFolder(token) {
        if (appConfig._vgDriveFolderId) return appConfig._vgDriveFolderId;
        const folderName = appConfig.vgDriveFolderName || 'Video Guestbook Captures';
        const query = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${folderName.replace(/'/g,"\\'")}' and trashed=false`);
        const searchResp = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
            headers: { Authorization: 'Bearer ' + token }
        });
        const searchData = await searchResp.json();
        if (searchData.files && searchData.files.length > 0) {
            appConfig._vgDriveFolderId = searchData.files[0].id;
            return appConfig._vgDriveFolderId;
        }
        const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder' })
        });
        const folder = await createResp.json();
        appConfig._vgDriveFolderId = folder.id;
        return folder.id;
    }

    // Find or create the event sub-folder inside the root VG folder; returns its folderId
    async function _vgDriveEnsureEventFolder(token) {
        if (appConfig._vgDriveEventFolderId) return appConfig._vgDriveEventFolderId;
        const parentId = await _vgDriveEnsureFolder(token);
        const subName = appConfig.eventName ? appConfig.eventName.trim() : 'Default Event';
        const query = encodeURIComponent(
            `mimeType='application/vnd.google-apps.folder' and name='${subName.replace(/'/g,"\\'")}' and '${parentId}' in parents and trashed=false`
        );
        const searchResp = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
            headers: { Authorization: 'Bearer ' + token }
        });
        const searchData = await searchResp.json();
        if (searchData.files && searchData.files.length > 0) {
            appConfig._vgDriveEventFolderId = searchData.files[0].id;
            return appConfig._vgDriveEventFolderId;
        }
        const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: subName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
        });
        const sub = await createResp.json();
        appConfig._vgDriveEventFolderId = sub.id;
        return sub.id;
    }

    // UI: VG Drive folder name input
    $('#vg-drive-folder-name').on('input', function() {
        appConfig.vgDriveFolderName = this.value.trim() || 'Video Guestbook Captures';
        appConfig._vgDriveFolderId = null; // reset folder cache
    });

    // UI: VG Drive client ID input
    $('#vg-drive-client-id').on('input', function() {
        appConfig.vgDriveClientId = this.value.trim();
        appConfig._vgDriveAccessToken = null;
        appConfig._vgDriveFolderId = null;
    });

    // UI: VG Drive sign-in
    $('#btn-vg-drive-signin').on('click', async function() {
        const btn = $(this);
        const clientId = _getVgDriveClientId();
        if (!clientId || clientId.startsWith('YOUR_CLIENT')) {
            _vgDriveSetStatus('Enter your Client ID above first.', true);
            return;
        }
        btn.prop('disabled', true).text('Signing in…');
        _vgDriveSetStatus('');
        try {
            await _vgDriveRequestToken();
            _vgDriveSetStatus('✓ Connected — videos will upload automatically', false);
            btn.hide();
            $('#btn-vg-drive-signout').show();
        } catch (e) {
            _vgDriveSetStatus('Sign-in failed: ' + e.message, true);
        } finally {
            btn.prop('disabled', false).text('Sign in with Google');
        }
    });

    // UI: VG Drive sign-out
    $('#btn-vg-drive-signout').on('click', function() {
        if (appConfig._vgDriveAccessToken) {
            google.accounts.oauth2.revoke(appConfig._vgDriveAccessToken, () => {});
        }
        appConfig._vgDriveAccessToken = null;
        appConfig._vgDriveFolderId = null;
        $(this).hide();
        $('#btn-vg-drive-signin').show();
        _vgDriveSetStatus('Signed out', false);
    });

    // ──────────────────────────────────────────────────────────────────────────

    // --- Camera selection ---
    async function populateCameraList() {
        const diag = document.getElementById('camera-diag');
        const setDiag = (html) => { if (diag) diag.innerHTML = html; };
        setDiag('<span style="color:#9ca3af;">Scanning for cameras…</span>');

        try {
            // getUserMedia must be called first so the browser reveals device labels.
            // Try both front and environment to unlock labels for all physical cameras
            // (some Android tablets require a separate permission call per camera group).
            const permResults = await Promise.allSettled([
                navigator.mediaDevices.getUserMedia({ video: true }),
                navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            ]);
            permResults.forEach(r => {
                if (r.status === 'fulfilled') r.value.getTracks().forEach(t => t.stop());
            });
            const allDenied = permResults.every(r => r.status === 'rejected');
            if (allDenied) {
                const err = permResults[0].reason;
                setDiag(`<span style="color:#dc2626;">⚠ Camera permission denied (${err.name}). Grant camera access in browser settings, then tap Refresh.</span>`);
                document.getElementById('camera-select').innerHTML = '<option value="">— permission denied —</option>';
                return;
            }

            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoInputs = devices.filter(d => d.kind === 'videoinput');
            const sel = document.getElementById('camera-select');
            const prevValue = appConfig.selectedCameraId || sel.value;

            sel.innerHTML = '';
            if (videoInputs.length === 0) {
                sel.innerHTML = '<option value="">No cameras found</option>';
                setDiag('<span style="color:#dc2626;">⚠ No cameras detected. Plug in the camera, make sure it is in UVC mode, then tap Refresh.</span>');
                return;
            }

            videoInputs.forEach((cam, i) => {
                const opt = document.createElement('option');
                opt.value = cam.deviceId;
                opt.textContent = cam.label || ('Camera ' + (i + 1));
                // Auto-prefer USB/external cameras and known action cameras (DJI, GoPro, etc.)
                const lbl = (cam.label || '').toLowerCase();
                if (!appConfig.selectedCameraId &&
                    (lbl.includes('usb') || lbl.includes('external') ||
                     lbl.includes('dji') || lbl.includes('action') || lbl.includes('gopro'))) {
                    opt.selected = true;
                }
                sel.appendChild(opt);
            });

            // Restore previously chosen camera if still available
            if (prevValue && [...sel.options].some(o => o.value === prevValue)) {
                sel.value = prevValue;
            }
            appConfig.selectedCameraId = sel.value;

            // Build diagnostic list so user can see what the browser actually found
            const lines = videoInputs.map((cam, i) => {
                const lbl = cam.label || '<em style="color:#f59e0b;">no label — tap Refresh after granting camera permission</em>';
                const shortId = cam.deviceId ? ' <span style="color:#9ca3af;font-family:monospace;font-size:0.72rem;">' + cam.deviceId.slice(0, 10) + '…</span>' : '';
                return `<span style="display:block;">[${i + 1}] ${lbl}${shortId}</span>`;
            }).join('');
            const hint = videoInputs.some(c => !c.label)
                ? '<span style="color:#f59e0b; display:block; margin-top:3px;">⚠ Some cameras have no label — grant camera permission and tap Refresh.</span>'
                : '';
            setDiag(`<span style="font-weight:600;">${videoInputs.length} camera(s) detected:</span><span style="display:block; margin-top:2px;">${lines}</span>${hint}`);

        } catch (e) {
            setDiag(`<span style="color:#dc2626;">⚠ Error: ${e.name} — ${e.message}</span>`);
            console.warn('populateCameraList:', e);
        }
    }

    $('#camera-select').on('change', function() {
        appConfig.selectedCameraId = this.value;
    });

    // --- Test Camera (live preview in settings) ---
    let _testStream = null;

    function _stopCameraTest() {
        if (_testStream) { _testStream.getTracks().forEach(t => t.stop()); _testStream = null; }
        const pv = document.getElementById('camera-test-preview');
        if (pv) pv.srcObject = null;
        $('#camera-test-card').hide();
        $('#btn-test-camera').text('▶ Test');
    }

    $('#btn-test-camera').on('click', async function() {
        const btn = $(this);
        if (_testStream) { _stopCameraTest(); return; }

        btn.prop('disabled', true).text('Opening…');
        const diag = document.getElementById('camera-diag');
        try {
            const deviceId = appConfig.selectedCameraId;
            const constraints = deviceId
                ? { video: { deviceId: { exact: deviceId } } }
                : { video: appConfig.facingMode ? { facingMode: appConfig.facingMode } : true };

            _testStream = await navigator.mediaDevices.getUserMedia(constraints);
            const pv = document.getElementById('camera-test-preview');
            pv.srcObject = _testStream;

            // Show resolution info once track is active
            const track = _testStream.getVideoTracks()[0];
            const settings = track.getSettings();
            const info = document.getElementById('camera-test-info');
            if (info) info.textContent = `${track.label}  ·  ${settings.width || '?'} × ${settings.height || '?'}`;

            $('#camera-test-card').show();
            btn.prop('disabled', false).text('⏹ Stop Test');
        } catch (e) {
            btn.prop('disabled', false).text('▶ Test');
            const msg = `<span style="color:#dc2626;">⚠ Could not open camera: <strong>${e.name}</strong> — ${e.message}</span>`;
            if (diag) diag.innerHTML = msg;
        }
    });

    $('#btn-stop-camera-test').on('click', function() { _stopCameraTest(); });

    // --- Capture Settings Tabs ---
    document.querySelectorAll('.capture-tab-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const target = this.dataset.capTab;
            document.querySelectorAll('.capture-tab-btn').forEach(function(b) { b.classList.remove('active'); });
            document.querySelectorAll('.cap-tab-content').forEach(function(c) { c.style.display = 'none'; });
            this.classList.add('active');
            const tabEl = document.getElementById(target);
            if (tabEl) tabEl.style.display = '';
            // Set capture mode based on active tab
            appConfig.captureMode = (target === 'cap-tab-videoguestbook') ? 'videoguestbook' : 'photobooth';
            updateAdvancedNavForMode(appConfig.captureMode);
        });
    });

    // --- Video Guestbook Settings ---
    $('#setting-vg-duration').on('input', function() {
        appConfig.vgMaxDuration = parseInt(this.value, 10);
        $('#val-vg-duration').text(this.value);
    });
    $('#setting-vg-countdown').on('input', function() {
        appConfig.vgCountdown = parseInt(this.value, 10);
        $('#val-vg-countdown').text(this.value);
    });
    $('#setting-vg-prompt').on('input', function() {
        appConfig.vgPromptText = this.value;
    });

    // --- VG Preview toggle ---
    (function initVgPreview() {
        function _syncPreviewToggle() {
            const on = appConfig.vgPreviewEnabled;
            $('#toggle-vg-preview').prop('checked', on).closest('.toggle-switch').toggleClass('is-on', on);
            $('#toggle-vg-preview-label').text(on ? 'ON' : 'OFF');
        }
        _syncPreviewToggle();
        $('#toggle-vg-preview').on('change', function() {
            appConfig.vgPreviewEnabled = this.checked;
            $('#toggle-vg-preview-label').text(this.checked ? 'ON' : 'OFF');
            $(this).closest('.toggle-switch').toggleClass('is-on', this.checked);
        });
    })();

    // --- VG Camera Selection ---
    async function populateVgCameraList() {
        const diag = document.getElementById('vg-camera-diag');
        const setDiag = (html) => { if (diag) diag.innerHTML = html; };
        setDiag('<span style="color:#9ca3af;">Scanning for cameras…</span>');

        try {
            const permResults = await Promise.allSettled([
                navigator.mediaDevices.getUserMedia({ video: true }),
                navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            ]);
            permResults.forEach(r => {
                if (r.status === 'fulfilled') r.value.getTracks().forEach(t => t.stop());
            });
            const allDenied = permResults.every(r => r.status === 'rejected');
            if (allDenied) {
                const err = permResults[0].reason;
                setDiag(`<span style="color:#dc2626;">⚠ Camera permission denied (${err.name}). Grant camera access in browser settings, then tap Refresh.</span>`);
                document.getElementById('vg-camera-select').innerHTML = '<option value="">— permission denied —</option>';
                return;
            }

            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoInputs = devices.filter(d => d.kind === 'videoinput');
            const sel = document.getElementById('vg-camera-select');
            const prevValue = appConfig.vgSelectedCameraId || sel.value;

            sel.innerHTML = '';
            if (videoInputs.length === 0) {
                sel.innerHTML = '<option value="">No cameras found</option>';
                setDiag('<span style="color:#dc2626;">⚠ No cameras detected. Plug in the camera, make sure it is in UVC mode, then tap Refresh.</span>');
                return;
            }

            videoInputs.forEach((cam, i) => {
                const opt = document.createElement('option');
                opt.value = cam.deviceId;
                opt.textContent = cam.label || ('Camera ' + (i + 1));
                const lbl = (cam.label || '').toLowerCase();
                if (!appConfig.vgSelectedCameraId &&
                    (lbl.includes('usb') || lbl.includes('external') ||
                     lbl.includes('dji') || lbl.includes('action') || lbl.includes('gopro'))) {
                    opt.selected = true;
                }
                sel.appendChild(opt);
            });

            if (prevValue && [...sel.options].some(o => o.value === prevValue)) {
                sel.value = prevValue;
            }
            appConfig.vgSelectedCameraId = sel.value;

            const lines = videoInputs.map((cam, i) => {
                const lbl = cam.label || '<em style="color:#f59e0b;">no label — tap Refresh after granting camera permission</em>';
                const shortId = cam.deviceId ? ' <span style="color:#9ca3af;font-family:monospace;font-size:0.72rem;">' + cam.deviceId.slice(0, 10) + '…</span>' : '';
                return `<span style="display:block;">[${i + 1}] ${lbl}${shortId}</span>`;
            }).join('');
            const hint = videoInputs.some(c => !c.label)
                ? '<span style="color:#f59e0b; display:block; margin-top:3px;">⚠ Some cameras have no label — grant camera permission and tap Refresh.</span>'
                : '';
            setDiag(`<span style="font-weight:600;">${videoInputs.length} camera(s) detected:</span><span style="display:block; margin-top:2px;">${lines}</span>${hint}`);
        } catch (e) {
            setDiag(`<span style="color:#dc2626;">⚠ Error: ${e.name} — ${e.message}</span>`);
            console.warn('populateVgCameraList:', e);
        }
    }

    $('#vg-camera-select').on('change', function() {
        appConfig.vgSelectedCameraId = this.value;
    });

    $('input[name="vg-facing-mode"]').on('change', function() {
        appConfig.vgFacingMode = this.value;
        $('#vg-camera-specific-card').toggle(this.value === '');
    });

    $('#btn-refresh-vg-cameras').on('click', function() {
        const btn = $(this);
        btn.prop('disabled', true).text('Refreshing…');
        populateVgCameraList().finally(() => btn.prop('disabled', false).text('↺ Refresh'));
    });

    // --- VG Test Camera ---
    let _vgTestStream = null;

    function _stopVgCameraTest() {
        if (_vgTestStream) { _vgTestStream.getTracks().forEach(t => t.stop()); _vgTestStream = null; }
        const pv = document.getElementById('vg-camera-test-preview');
        if (pv) pv.srcObject = null;
        $('#vg-camera-test-card').hide();
        $('#btn-test-vg-camera').text('▶ Test');
    }

    $('#btn-test-vg-camera').on('click', async function() {
        const btn = $(this);
        if (_vgTestStream) { _stopVgCameraTest(); return; }

        btn.prop('disabled', true).text('Opening…');
        const diag = document.getElementById('vg-camera-diag');
        try {
            const deviceId = appConfig.vgSelectedCameraId;
            const constraints = deviceId && appConfig.vgFacingMode === ''
                ? { video: { deviceId: { exact: deviceId } } }
                : { video: appConfig.vgFacingMode ? { facingMode: appConfig.vgFacingMode } : true };

            _vgTestStream = await navigator.mediaDevices.getUserMedia(constraints);
            const pv = document.getElementById('vg-camera-test-preview');
            pv.srcObject = _vgTestStream;

            const track = _vgTestStream.getVideoTracks()[0];
            const settings = track.getSettings();
            const info = document.getElementById('vg-camera-test-info');
            if (info) info.textContent = `${track.label}  ·  ${settings.width || '?'} × ${settings.height || '?'}`;

            $('#vg-camera-test-card').show();
            btn.prop('disabled', false).text('⏹ Stop Test');
        } catch (e) {
            btn.prop('disabled', false).text('▶ Test');
            const msg = `<span style="color:#dc2626;">⚠ Could not open camera: <strong>${e.name}</strong> — ${e.message}</span>`;
            if (diag) diag.innerHTML = msg;
        }
    });

    $('#btn-stop-vg-camera-test').on('click', function() { _stopVgCameraTest(); });

    // --- VG Audio Device Selection (Microphone & Speaker) ---
    async function populateVgAudioDeviceList() {
        const diag = document.getElementById('vg-audio-diag');
        const setDiag = (html) => { if (diag) diag.innerHTML = html; };
        setDiag('<span style="color:#9ca3af;">Scanning for audio devices…</span>');

        try {
            // Request audio permission so browsers expose device labels.
            let permStream = null;
            try {
                permStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (e) {
                setDiag(`<span style="color:#dc2626;">⚠ Microphone permission denied (${e.name}). Grant microphone access in browser settings, then tap ↺ Refresh.</span>`);
                return;
            } finally {
                if (permStream) permStream.getTracks().forEach(t => t.stop());
            }

            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs  = devices.filter(d => d.kind === 'audioinput');
            const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

            // --- Microphone dropdown ---
            const micSel = document.getElementById('vg-mic-select');
            const prevMicVal = appConfig.vgSelectedMicId;
            micSel.innerHTML = '<option value="">— Default microphone —</option>';
            audioInputs.forEach((dev, i) => {
                const opt = document.createElement('option');
                opt.value = dev.deviceId;
                opt.textContent = dev.label || ('Microphone ' + (i + 1));
                micSel.appendChild(opt);
            });
            if (prevMicVal && [...micSel.options].some(o => o.value === prevMicVal)) {
                micSel.value = prevMicVal;
            }
            appConfig.vgSelectedMicId = micSel.value;

            // --- Speaker dropdown ---
            const spkSel = document.getElementById('vg-speaker-select');
            const prevSpkVal = appConfig.vgSelectedSpeakerId;
            spkSel.innerHTML = '<option value="">— Default speaker —</option>';
            if (audioOutputs.length === 0) {
                const noDevOpt = document.createElement('option');
                noDevOpt.value = '';
                noDevOpt.disabled = true;
                noDevOpt.textContent = 'No output devices found';
                spkSel.appendChild(noDevOpt);
            } else {
                audioOutputs.forEach((dev, i) => {
                    const opt = document.createElement('option');
                    opt.value = dev.deviceId;
                    opt.textContent = dev.label || ('Speaker ' + (i + 1));
                    spkSel.appendChild(opt);
                });
            }
            if (prevSpkVal && [...spkSel.options].some(o => o.value === prevSpkVal)) {
                spkSel.value = prevSpkVal;
            }
            appConfig.vgSelectedSpeakerId = spkSel.value;

            // Diagnostic summary
            const inputLines  = audioInputs.map((d, i) => `<span style="display:block;">[${i + 1}] ${d.label || '<em style="color:#f59e0b;">no label</em>'}</span>`).join('');
            const outputLines = audioOutputs.map((d, i) => `<span style="display:block;">[${i + 1}] ${d.label || '<em style="color:#f59e0b;">no label</em>'}</span>`).join('');
            const noOutputHint = audioOutputs.length === 0
                ? '<span style="color:#f59e0b; display:block; margin-top:3px;">⚠ No audio output devices found — speaker selection not available on this browser/device.</span>'
                : '';
            setDiag(
                `<span style="font-weight:600;">${audioInputs.length} mic(s) · ${audioOutputs.length} output(s) detected:</span>` +
                (inputLines  ? `<span style="display:block; margin-top:2px;">${inputLines}</span>`  : '') +
                (outputLines ? `<span style="display:block; margin-top:2px;">${outputLines}</span>` : '') +
                noOutputHint
            );
        } catch (e) {
            setDiag(`<span style="color:#dc2626;">⚠ Error: ${e.name} — ${e.message}</span>`);
            console.warn('populateVgAudioDeviceList:', e);
        }
    }

    $('#vg-mic-select').on('change', function() {
        appConfig.vgSelectedMicId = this.value;
    });

    $('#vg-speaker-select').on('change', function() {
        appConfig.vgSelectedSpeakerId = this.value;
    });

    $('#btn-refresh-vg-audio').on('click', function() {
        const btn = $(this);
        btn.prop('disabled', true).text('Refreshing…');
        populateVgAudioDeviceList().finally(() => btn.prop('disabled', false).text('↺ Refresh'));
    });

    // --- VG Storage — checkbox toggles (both local + drive can be active) ---
    $('#chk-vg-save-local').on('change', function() {
        appConfig.vgSaveLocal = this.checked;
        if (this.checked) {
            $('#vg-local-folder-config').slideDown();
        } else {
            $('#vg-local-folder-config').slideUp();
        }
    });

    $('#chk-vg-save-drive').on('change', function() {
        appConfig.vgSaveDrive = this.checked;
        if (this.checked) {
            $('#vg-drive-config').slideDown();
        } else {
            $('#vg-drive-config').slideUp();
        }
        _updateEventNameWarnings();
    });

    $('#btn-vg-select-dir').on('click', async function() {
        try {
            if (!window.showDirectoryPicker) {
                alert("Your browser does not support seamless folder saving. Videos will be saved via standard downloads.");
                return;
            }
            vgDirectoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            $('#vg-dir-status').text(`Saving to: /${vgDirectoryHandle.name}`);
        } catch (err) {
            console.log("Directory picker cancelled or failed.", err);
        }
    });

    // Populate VG camera and audio device lists on load
    populateVgCameraList();
    populateVgAudioDeviceList();

    // --- Advanced nav visibility based on capture mode ---
    function updateAdvancedNavForMode(mode) {
        const isVg = mode === 'videoguestbook';
        $('#nav-photo-layout, #nav-template, #nav-printer').toggle(!isVg);
        $('#nav-video-overlay, #nav-stitch').toggle(isVg);
        $('#nav-vg-thankyou').toggle(isVg);
        $('#nav-vg-prompts').toggle(isVg);
        // If a photo-only panel is active while switching to VG, go to dashboard
        if (isVg) {
            const active = $('.nav-item.active').data('target');
            if (active === 'panel-photo-layout' || active === 'panel-template' || active === 'panel-printer') {
                $('[data-target="panel-dashboard"]').trigger('click');
            }
        }
        // If VG-only panels are active while switching to PhotoBooth, go to dashboard
        if (!isVg) {
            const active = $('.nav-item.active').data('target');
            if (active === 'panel-video-overlay' || active === 'panel-stitch' || active === 'panel-vg-thankyou' || active === 'panel-vg-prompts') {
                $('[data-target="panel-dashboard"]').trigger('click');
            }
        }
    }

    // --- Video Overlay upload ---
    // The #btn-pick-vg-overlay label already opens the file picker natively (safe on mobile).
    // The drop-zone click handler only fires when clicking elsewhere on the drop zone.
    $('#vg-overlay-drop').on('click', function(e) {
        // Let label, remove button, and thumb handle themselves
        if ($(e.target).closest('#btn-pick-vg-overlay, #vg-overlay-remove').length) return;
        $('#vg-overlay-input').trigger('click');
    });

    $('#vg-overlay-input').on('change', function() {
        const file = this.files[0];
        this.value = '';
        if (!file) return;
        if (file.type !== 'image/png') {
            _showOverlayError('Please select a PNG file.');
            return;
        }
        const url = URL.createObjectURL(file);
        const testImg = new Image();
        testImg.onload = function() {
            if (testImg.naturalWidth !== 1920 || testImg.naturalHeight !== 1080) {
                URL.revokeObjectURL(url);
                _showOverlayError(`Image must be exactly 1920 × 1080 px (yours is ${testImg.naturalWidth} × ${testImg.naturalHeight} px).`);
                return;
            }
            _applyVgOverlay(url, file.name, testImg);
        };
        testImg.onerror = function() {
            URL.revokeObjectURL(url);
            _showOverlayError('Could not read the image. Please try another file.');
        };
        testImg.src = url;
    });

    // Drag-and-drop on overlay drop zone
    $('#vg-overlay-drop').on('dragover', function(e) { e.preventDefault(); $(this).addClass('drag-over'); });
    $('#vg-overlay-drop').on('dragleave drop', function(e) { e.preventDefault(); $(this).removeClass('drag-over'); });
    $('#vg-overlay-drop').on('drop', function(e) {
        const file = e.originalEvent.dataTransfer.files[0];
        if (!file) return;
        $('#vg-overlay-input')[0].files;  // clear
        // Reuse input change logic via synthetic assignment
        const dt = new DataTransfer();
        dt.items.add(file);
        const inp = document.getElementById('vg-overlay-input');
        inp.files = dt.files;
        $(inp).trigger('change');
    });

    $('#vg-overlay-remove').on('click', function(e) {
        e.stopPropagation();
        if (appConfig.vgOverlay) {
            URL.revokeObjectURL(appConfig.vgOverlay.objectUrl);
            appConfig.vgOverlay = null;
        }
        $('#vg-overlay-filled').hide();
        $('#vg-overlay-empty').show();
        $('#vg-overlay-thumb').attr('src', '');
        $('#vg-overlay-live').hide().attr('src', '');
        _clearOverlayError();
    });

    function _applyVgOverlay(url, filename, img) {
        if (appConfig.vgOverlay) URL.revokeObjectURL(appConfig.vgOverlay.objectUrl);
        appConfig.vgOverlay = { objectUrl: url, img };
        $('#vg-overlay-thumb').attr('src', url);
        $('#vg-overlay-filename').text(filename);
        $('#vg-overlay-empty').hide();
        $('#vg-overlay-filled').show();
        _clearOverlayError();
    }

    function _showOverlayError(msg) {
        $('#vg-overlay-error').text(msg).show();
    }
    function _clearOverlayError() {
        $('#vg-overlay-error').hide().text('');
    }

    // =========================================================
    // STITCH PANEL
    // =========================================================

    // Refresh the stitch grid whenever the panel is opened
    $(document).on('click', '[data-target="panel-stitch"]', function() {
        _refreshStitchPanel();
    });

    function _refreshStitchPanel() {
        const grid    = document.getElementById('stitch-grid');
        const empty   = document.getElementById('stitch-empty');
        const ctrls   = document.getElementById('stitch-controls');
        const result  = document.getElementById('stitch-result');
        const progWrap= document.getElementById('stitch-progress-wrap');

        result.style.display   = 'none';
        progWrap.style.display = 'none';
        $('#btn-stitch-run').prop('disabled', true);
        $('#stitch-selected-count').text('');

        if (capturedVideos.length === 0) {
            empty.style.display = 'block';
            grid.style.display  = 'none';
            ctrls.style.display = 'none';
            return;
        }

        empty.style.display = 'none';
        grid.style.display  = 'grid';
        ctrls.style.display = 'block';

        grid.innerHTML = '';
        capturedVideos.forEach((src, idx) => {
            const num = capturedVideos.length - idx;
            const item = document.createElement('div');
            item.className = 'stitch-item';
            item.dataset.idx = idx;
            item.innerHTML = `
                <label class="stitch-item-label">
                    <input type="checkbox" class="stitch-check" data-idx="${idx}">
                    <div class="stitch-thumb-wrap">
                        <video src="${src}" preload="metadata" muted playsinline class="stitch-thumb"></video>
                        <div class="gallery-play-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        </div>
                        <div class="stitch-check-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>
                    </div>
                    <span class="stitch-item-label-text">Clip #${num}</span>
                </label>`;
            grid.appendChild(item);
        });

        _updateStitchButtonState();
    }

    function _updateStitchButtonState() {
        const count = $('.stitch-check:checked').length;
        $('#btn-stitch-run').prop('disabled', count < 2);
        $('#stitch-selected-count').text(count > 0 ? `${count} clip${count !== 1 ? 's' : ''} selected` : '');
    }

    $(document).on('change', '.stitch-check', function() {
        const idx = $(this).data('idx');
        $(this).closest('.stitch-item').toggleClass('stitch-item-selected', this.checked);
        _updateStitchButtonState();
    });

    $('#btn-stitch-select-all').on('click', function() {
        $('.stitch-check').prop('checked', true);
        $('.stitch-item').addClass('stitch-item-selected');
        _updateStitchButtonState();
    });

    $('#btn-stitch-clear').on('click', function() {
        $('.stitch-check').prop('checked', false);
        $('.stitch-item').removeClass('stitch-item-selected');
        _updateStitchButtonState();
    });

    let _stitchResultBlob = null;

    $('#btn-stitch-run').on('click', async function() {
        const indices = [];
        $('.stitch-check:checked').each(function() { indices.push(parseInt($(this).data('idx'))); });
        if (indices.length < 2) return;

        const urls = indices.map(i => capturedVideos[i]);
        const progWrap = document.getElementById('stitch-progress-wrap');
        const statusEl = document.getElementById('stitch-status-text');
        const barEl    = document.getElementById('stitch-progress-bar');
        const resultEl = document.getElementById('stitch-result');
        const resultFn = document.getElementById('stitch-result-filename');

        progWrap.style.display = 'block';
        resultEl.style.display = 'none';
        $('#btn-stitch-run').prop('disabled', true);
        _stitchResultBlob = null;

        try {
            const { blob, ext: stitchExt } = await _stitchVideos(urls, function(pct, label) {
                barEl.style.width = pct + '%';
                statusEl.textContent = label;
            });

            _stitchResultBlob = blob;

            // Build filename
            const now = new Date();
            const ts = now.getFullYear()
                + String(now.getMonth() + 1).padStart(2, '0')
                + String(now.getDate()).padStart(2, '0')
                + '_'
                + String(now.getHours()).padStart(2, '0')
                + String(now.getMinutes()).padStart(2, '0')
                + String(now.getSeconds()).padStart(2, '0');
            const prefix = appConfig.eventName
                ? appConfig.eventName.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
                : 'guestbook';
            const filename = `${prefix}_${ts}_Final.${stitchExt}`;

            // Save to VG folder or trigger download
            try {
                if (vgDirectoryHandle) {
                    const fh = await vgDirectoryHandle.getFileHandle(filename, { create: true });
                    const wr = await fh.createWritable();
                    await wr.write(blob);
                    await wr.close();
                    resultFn.textContent = `Saved to folder as: ${filename}`;
                } else {
                    resultFn.textContent = `File ready: ${filename} — click Download below`;
                }
            } catch (saveErr) {
                console.error('[Stitch] Save error:', saveErr);
                resultFn.textContent = `Could not save to folder. Click Download below.`;
            }

            progWrap.style.display = 'none';
            barEl.style.width = '0%';
            resultEl.style.display = 'block';
            $('#btn-stitch-run').prop('disabled', false);

            // Wire download button
            $('#btn-stitch-download').off('click.stitch').on('click.stitch', function() {
                if (!_stitchResultBlob) return;
                const dlUrl = URL.createObjectURL(_stitchResultBlob);
                const a = document.createElement('a');
                a.href = dlUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(dlUrl), 5000);
            });

        } catch (err) {
            console.error('[Stitch] Error:', err);
            statusEl.textContent = `Error: ${err.message}`;
            barEl.style.width = '0%';
            $('#btn-stitch-run').prop('disabled', false);
        }
    });

    /**
     * Stitch an array of video blob URLs sequentially by replaying each on a
     * canvas and recording the canvas stream + audio via AudioContext.
     * Returns a Blob (video/mp4 or video/webm).
     */
    async function _stitchVideos(urls, onProgress) {
        const W = 1920, H = 1080;
        const canvas = document.createElement('canvas');
        canvas.width  = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        // Pick best supported MIME for the final file (prefer mp4)
        const mimeType = MediaRecorder.isTypeSupported('video/mp4')
            ? 'video/mp4'
            : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
            ? 'video/webm;codecs=vp8,opus'
            : 'video/webm';
        const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';

        // AudioContext routes each clip's audio into the recorder
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') await audioCtx.resume();
        const audioDest = audioCtx.createMediaStreamDestination();

        const chunks = [];
        const canvasStream = canvas.captureStream(30);
        // Combine canvas video + AudioContext audio destination into one stream
        const combinedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...audioDest.stream.getAudioTracks()
        ]);
        const recorder = new MediaRecorder(combinedStream, {
            mimeType,
            videoBitsPerSecond: 4000000
        });
        recorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };

        const recorderDone = new Promise(resolve => {
            recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
        });
        recorder.start(200);

        for (let i = 0; i < urls.length; i++) {
            onProgress(
                Math.round((i / urls.length) * 90),
                `Rendering clip ${i + 1} of ${urls.length}…`
            );
            await _playVideoOntoCanvas(ctx, urls[i], W, H, audioCtx, audioDest);
        }

        onProgress(95, 'Finalising…');
        recorder.stop();
        const resultBlob = await recorderDone;
        audioCtx.close();
        onProgress(100, 'Done!');
        return { blob: resultBlob, ext };
    }

    /**
     * Play a video (by blob URL) frame-by-frame onto a canvas context,
     * routing its audio through the provided AudioContext destination.
     * Resolves when the video ends.
     */
    function _playVideoOntoCanvas(ctx, url, W, H, audioCtx, audioDest) {
        return new Promise((resolve, reject) => {
            const vid = document.createElement('video');
            vid.src = url;
            vid.muted = false; // audio must be unmuted so AudioContext can capture it
            vid.volume = 1;
            vid.playsInline = true;

            let rafId = null;
            let sourceNode = null;

            function drawFrame() {
                if (vid.paused || vid.ended) return;
                ctx.drawImage(vid, 0, 0, W, H);
                rafId = requestAnimationFrame(drawFrame);
            }

            vid.onloadedmetadata = function() {
                // Route this clip's audio into the shared AudioContext destination
                if (audioCtx && audioDest) {
                    try {
                        sourceNode = audioCtx.createMediaElementSource(vid);
                        sourceNode.connect(audioDest);
                    } catch (e) {
                        console.warn('[Stitch] Audio routing error:', e);
                    }
                }
                vid.play().then(() => {
                    drawFrame();
                }).catch(reject);
            };

            vid.onended = function() {
                if (rafId) cancelAnimationFrame(rafId);
                ctx.drawImage(vid, 0, 0, W, H); // draw final frame
                if (sourceNode) { try { sourceNode.disconnect(); } catch (_) {} }
                vid.src = '';
                resolve();
            };

            vid.onerror = function() {
                if (rafId) cancelAnimationFrame(rafId);
                reject(new Error(`Failed to load video: ${url}`));
            };
        });
    }



    /**
     * Draw a video/image element scaled to fill (cover) a canvas rectangle,
     * centring and cropping just like CSS object-fit:cover.
     */
    function _drawCoverOnCanvas(ctx, src, dx, dy, dw, dh) {
        const sw = src.videoWidth  || src.naturalWidth  || dw;
        const sh = src.videoHeight || src.naturalHeight || dh;
        const scale = Math.max(dw / sw, dh / sh);
        const nw = sw * scale;
        const nh = sh * scale;
        ctx.drawImage(src, dx + (dw - nw) / 2, dy + (dh - nh) / 2, nw, nh);
    }

    $('input[name="facing-mode"]').on('change', function() {
        appConfig.facingMode = this.value;
        $('#camera-specific-card').toggle(this.value === '');
    });

    $('#btn-refresh-cameras').on('click', function() {
        const btn = $(this);
        btn.prop('disabled', true).text('Refreshing…');
        populateCameraList().finally(() => btn.prop('disabled', false).text('↺ Refresh'));
    });

    // Populate on load (non-blocking)
    populateCameraList();

    // --- Launch Kiosk ---
    // Mobile duplicate button delegates to the main launch button
    $('#btn-launch-booth-mobile').on('click', function() { $('#btn-launch-booth').trigger('click'); });

    $('#btn-launch-booth').on('click', async function() {
        appConfig.layout = $('input[name="layout"]:checked').val();
        const launchBtn = $(this);
        launchBtn.prop('disabled', true).text('Initializing Hardware...');
        _stopCameraTest();    // always release the test preview stream before launching
        _stopVgCameraTest(); // also release VG test preview stream

        try {
        // ── Normal getUserMedia path ─────────────────────────────────────
            // Build video constraints: specific device takes priority, then facingMode.
            // Video Guestbook uses a lower resolution (1080p max) to prevent encoder
            // lag and stuttering; PhotoBooth uses the highest available for still quality.
            const isVgMode = appConfig.captureMode === 'videoguestbook';
            const videoConstraints = isVgMode
                ? { width: { ideal: 1920, max: 1920 }, height: { ideal: 1080, max: 1080 }, frameRate: { ideal: 30, max: 30 } }
                : { width: { ideal: 4096 }, height: { ideal: 3072 } };
            if (appConfig.selectedCameraId && appConfig.facingMode === '') {
                videoConstraints.deviceId = { exact: appConfig.selectedCameraId };
            } else if (appConfig.facingMode) {
                videoConstraints.facingMode = { ideal: appConfig.facingMode };
            }
            // For VG mode, override with VG-specific camera settings
            if (isVgMode) {
                delete videoConstraints.deviceId;
                delete videoConstraints.facingMode;
                if (appConfig.vgSelectedCameraId && appConfig.vgFacingMode === '') {
                    videoConstraints.deviceId = { exact: appConfig.vgSelectedCameraId };
                } else if (appConfig.vgFacingMode) {
                    videoConstraints.facingMode = { ideal: appConfig.vgFacingMode };
                }
            }
            const audioConstraint = (isVgMode && appConfig.vgSelectedMicId)
                ? { deviceId: { exact: appConfig.vgSelectedMicId } }
                : true;
            const constraints = isVgMode
                ? { video: videoConstraints, audio: audioConstraint }
                : { video: videoConstraints };

            currentStream = await navigator.mediaDevices.getUserMedia(constraints);

            if (appConfig.captureMode === 'videoguestbook') {
                const vgFeedEl = $('#vg-camera-feed')[0];
                vgFeedEl.srcObject = currentStream;
                // Route playback audio to the selected Bluetooth speaker (setSinkId is
                // not universally supported — silently ignore if unavailable).
                if (appConfig.vgSelectedSpeakerId && typeof vgFeedEl.setSinkId === 'function') {
                    try {
                        await vgFeedEl.setSinkId(appConfig.vgSelectedSpeakerId);
                    } catch (e) {
                        console.warn('[VG] setSinkId failed (speaker not available):', e.message);
                    }
                }
            } else {
                $('#camera-feed')[0].srcObject = currentStream;
                applyKioskViewfinderSize();
            }

            $('#admin-dashboard').hide();
            $('#kiosk-mode').fadeIn(400);
            resetToWelcomeScreen();
            
        } catch (err) {
            console.error("Camera error:", err);
            let hint = '';
            if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                hint = '\n\nThe selected camera was not found. Unplug and replug the USB cable, confirm UVC mode is active on the camera, then tap Refresh in Camera Settings.';
            } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                hint = '\n\nCamera permission was denied. Go to Android Settings → Apps → Chrome → Permissions → Camera → Allow, then try again.';
            } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                hint = '\n\nThe camera is in use by another app, or the USB connection dropped. Unplug and replug, close other camera apps, then try again.';
            }
            alert(`Camera error: ${err.name}\n${err.message}${hint}`);
        } finally {
            launchBtn.prop('disabled', false).text('🚀 Launch Kiosk Mode');
        }
    });

    $('#btn-exit-kiosk').on('click', function() {
        stopVgRecordingIfActive();
        if (currentStream) { currentStream.getTracks().forEach(track => track.stop()); currentStream = null; }
        $('#kiosk-mode').hide();
        $('#vg-booth').hide();
        $('#live-booth').hide();
        $('#admin-dashboard').fadeIn(400);
    });

    // --- Kiosk Logic (PhotoBooth) ---
    $('#btn-start-session').on('click', async function() {
        if (appConfig.disclaimerEnabled) {
            const accepted = await showDisclaimerDialog(
                appConfig.disclaimerHeader,
                appConfig.disclaimerText,
                appConfig.disclaimerOrg
            );
            if (!accepted) return; // session forfeited — do nothing, no saves
        }
        $('#guest-welcome').addClass('hidden');
        setTimeout(triggerCaptureSequence, 500);
    });

    // --- Kiosk Logic (Video Guestbook) ---
    $('#btn-start-vg-session').on('click', async function() {
        if (appConfig.disclaimerEnabled) {
            const accepted = await showDisclaimerDialog(
                appConfig.disclaimerHeader,
                appConfig.disclaimerText,
                appConfig.disclaimerOrg
            );
            if (!accepted) return; // session forfeited — do nothing, no saves
        }
        $('#guest-welcome').addClass('hidden');
        setTimeout(triggerVgSequence, 500);
    });

    // Tap anywhere on the welcome screen to start (not just the small button)
    $('#guest-welcome').on('click', function(e) {
        if ($(e.target).closest('#btn-exit-kiosk, #btn-start-session, #btn-start-vg-session').length) return;
        if (appConfig.captureMode === 'videoguestbook') {
            $('#btn-start-vg-session').trigger('click');
        } else {
            $('#btn-start-session').trigger('click');
        }
    });

    // Lock scroll/pinch-zoom inside kiosk (prevents accidental browser gestures)
    document.getElementById('kiosk-mode').addEventListener('touchmove', function(e) {
        e.preventDefault();
    }, { passive: false });

    function applyKioskViewfinderSize() {
        // Derive slot AR from the chosen layout so the viewfinder shows
        // exactly what drawPhoto() will capture for each photo slot.
        const { photoSlots } = computeLayout(1920, 1080);
        const slot   = photoSlots[0];
        const slotAR = slot.w / slot.h;

        const viewfinder = document.querySelector('.viewfinder');
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let w, h;
        if (vw / vh > slotAR) {
            // Screen wider than slot — fit by height
            h = vh;
            w = Math.round(vh * slotAR);
        } else {
            // Screen taller than slot — fit by width
            w = vw;
            h = Math.round(vw / slotAR);
        }
        viewfinder.style.width  = w + 'px';
        viewfinder.style.height = h + 'px';
    }

    function resetToWelcomeScreen() {
        // Hide capture screens
        $('#photo-canvas').hide();
        // Show the camera feed element
        $('#camera-feed').show();
        $('#processing-overlay').hide();
        $('#live-booth').hide();
        $('#vg-booth').hide();

        // Show the correct start button for the active mode
        const isVg = appConfig.captureMode === 'videoguestbook';
        $('#btn-start-session').toggle(!isVg);
        $('#btn-start-vg-session').toggle(isVg);

        // Update the subtitle to reflect current mode
        if (isVg) {
            $('#live-ws-subtitle').text(appConfig.vgPromptText || $('#setting-vg-prompt').val());
        } else {
            $('#live-ws-subtitle').text(appConfig.welcomeSubtitle || $('#edit-subtitle').val());
        }

        // Show recent captures button if there are any captures
        const totalCaptures = capturedPhotos.length + capturedVideos.length;
        $('#btn-recent-captures').toggle(totalCaptures > 0);

        $('#guest-welcome').removeClass('hidden');
        // Resume welcome video if it was paused
        const kv = $('#ws-video-bg')[0];
        if (kv && appConfig.welcomeMedia && appConfig.welcomeMedia.type === 'video' && kv.paused) {
            kv.play();
        }
    }

    // ==================== RECENT CAPTURES KIOSK MODAL ====================
    (function initRecentCapturesModal() {
        let _rcmItems = []; // [{type:'photo'|'video', src:string}]
        let _rcmIdx   = 0;

        function _buildItems() {
            _rcmItems = [];
            capturedPhotos.forEach(function(src) { _rcmItems.push({ type: 'photo', src: src }); });
            capturedVideos.forEach(function(src) { _rcmItems.push({ type: 'video', src: src }); });
        }

        function _openModal() {
            _buildItems();
            const $modal = $('#recent-captures-modal');
            const $grid  = $('#rcm-grid').empty();
            const $empty = $('#rcm-empty');
            if (_rcmItems.length === 0) {
                $empty.css('display', 'flex');
                $grid.hide();
            } else {
                $empty.hide();
                $grid.show();
                _rcmItems.forEach(function(item, idx) {
                    if (item.type === 'photo') {
                        const $card = $('<div class="rcm-card" data-idx="' + idx + '"><img src="' + item.src + '" alt=""><div class="rcm-badge">📸</div></div>');
                        $grid.append($card);
                    } else {
                        const $card = $('<div class="rcm-card rcm-card-video" data-idx="' + idx + '"><video src="' + item.src + '" muted playsinline preload="metadata"></video><div class="rcm-badge">🎬</div><div class="rcm-play-icon">▶</div></div>');
                        $grid.append($card);
                        // Seek to a frame for thumbnail
                        const vid = $card.find('video')[0];
                        vid.addEventListener('loadedmetadata', function() { vid.currentTime = Math.min(0.5, vid.duration * 0.1); }, { once: true });
                    }
                });
            }
            $modal.css('display', 'flex');
        }

        function _openLightbox(idx) {
            _rcmIdx = idx;
            _renderLightbox();
            $('#rcm-lightbox').css('display', 'flex');
        }

        function _renderLightbox() {
            const item = _rcmItems[_rcmIdx];
            if (!item) return;
            const $img   = $('#rcm-lb-img');
            const $video = $('#rcm-lb-video');
            if (item.type === 'photo') {
                $video.hide().attr('src', '')[0].pause();
                $img.attr('src', item.src).show();
            } else {
                $img.hide().attr('src', '');
                $video.attr('src', item.src).show()[0].play();
            }
            $('#rcm-lb-counter').text((_rcmIdx + 1) + ' / ' + _rcmItems.length);
            $('#btn-rcm-lb-prev').toggle(_rcmIdx > 0);
            $('#btn-rcm-lb-next').toggle(_rcmIdx < _rcmItems.length - 1);
        }

        function _closeLightbox() {
            $('#rcm-lb-video')[0].pause();
            $('#rcm-lightbox').hide();
        }

        // Event bindings
        $('#btn-recent-captures').on('click', function(e) {
            e.stopPropagation();
            _openModal();
        });

        $('#btn-close-rcm').on('click', function() {
            _closeLightbox();
            $('#recent-captures-modal').hide();
        });

        $(document).on('click', '.rcm-card', function() {
            _openLightbox(parseInt($(this).data('idx'), 10));
        });

        $('#btn-rcm-lb-close').on('click', _closeLightbox);

        $('#btn-rcm-lb-prev').on('click', function() {
            if (_rcmIdx > 0) { _rcmIdx--; _renderLightbox(); }
        });

        $('#btn-rcm-lb-next').on('click', function() {
            if (_rcmIdx < _rcmItems.length - 1) { _rcmIdx++; _renderLightbox(); }
        });
    })();

    // ==================== DRIVE: SET FILE PUBLIC ====================
    // Makes a Drive file readable by anyone with the link (so QR scan works)
    async function _driveSetPublic(token, fileId) {
        try {
            await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: 'reader', type: 'anyone' })
            });
        } catch (e) {
            console.warn('[Drive] Could not set public permission:', e.message);
        }
    }
    // ===============================================================

    // ==================== QR CODE OVERLAY ==========================
    let _currentPbDriveLink = null;  // stores Drive link for current PB capture
    let _currentVgDriveLink = null;  // stores Drive link for current VG capture
    let _qrInstance = null;

    function showQrOverlay(url, caption) {
        const container = document.getElementById('qr-code-container');
        container.innerHTML = '';
        if (_qrInstance) { try { _qrInstance.clear(); } catch(e) {} }
        $('#qr-modal-title').text(caption || 'Scan to get your copy');
        $('#qr-modal-url').text(url);
        _qrInstance = new QRCode(container, {
            text: url,
            width: 240,
            height: 240,
            colorDark: '#111827',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
        $('#qr-overlay').css('display', 'flex');
    }

    $('#btn-qr-close').on('click', function() {
        $('#qr-overlay').hide();
    });

    // PB share overlay — QR button
    $('#btn-share-qr').on('click', function() {
        if (_currentPbDriveLink) {
            showQrOverlay(_currentPbDriveLink, 'Scan to download your photo');
        }
    });

    // VG preview overlay — QR button
    $('#btn-vg-qr').on('click', function() {
        if (_currentVgDriveLink) {
            showQrOverlay(_currentVgDriveLink, 'Scan to download your video');
        }
    });
    // ===============================================================

    // ==================== SOCIAL SHARING ====================
    let _shareObjectUrl = null;
    let _shareCountdownTimer = null;

    function showShareOverlay(canvas, dataUrl) {
        // Reset QR state for this new capture
        _currentPbDriveLink = null;
        $('#btn-share-qr').hide();
        $('#share-preview-img').attr('src', dataUrl);
        // Build a blob URL for the Web Share API (file-level sharing)
        canvas.toBlob(blob => {
            if (_shareObjectUrl) URL.revokeObjectURL(_shareObjectUrl);
            _shareObjectUrl = URL.createObjectURL(blob);
        }, 'image/png', 1.0);
        // Only show native share button when the browser supports it
        $('#btn-share-native').toggle(typeof navigator.share === 'function');
        $('#share-overlay').fadeIn(300);
        // Auto-dismiss countdown (at least 8 s so user has time to act)
        let remaining = Math.max(appConfig.reviewTime, 8);
        $('#share-countdown').text(remaining);
        clearInterval(_shareCountdownTimer);
        _shareCountdownTimer = setInterval(() => {
            remaining--;
            $('#share-countdown').text(remaining);
            if (remaining <= 0) { clearInterval(_shareCountdownTimer); hideShareOverlay(); }
        }, 1000);
    }

    function hideShareOverlay() {
        clearInterval(_shareCountdownTimer);
        $('#share-overlay').fadeOut(200, () => {
            $('#share-preview-img').attr('src', '');
            if (_shareObjectUrl) { URL.revokeObjectURL(_shareObjectUrl); _shareObjectUrl = null; }
        });
        $('#processing-overlay h2').text('Processing...');
        $('.spinner').show();
        resetToWelcomeScreen();
    }
    // =========================================================

    async function triggerCaptureSequence() {
        $('#live-booth').show();
        const video = $('#camera-feed')[0];
        const previewCanvas = $('#photo-canvas')[0];
        const previewCtx = previewCanvas.getContext('2d');

        const fW = video.videoWidth  || video.naturalWidth  || video.width;
        const fH = video.videoHeight || video.naturalHeight || video.height;

        const { cWidth, cHeight, photoSlots } = computeLayout(fW, fH);

        const stripCanvas = document.createElement('canvas');
        stripCanvas.width = cWidth;
        stripCanvas.height = cHeight;
        const stripCtx = stripCanvas.getContext('2d');

        // Background: custom uploaded image or white fill
        if (appConfig.templateBg) {
            stripCtx.drawImage(appConfig.templateBg, 0, 0, cWidth, cHeight);
        } else {
            stripCtx.fillStyle = '#FFFFFF';
            stripCtx.fillRect(0, 0, cWidth, cHeight);
        }

        // --- DYNAMIC SEQUENCE LOOP ---
        for (let i = 0; i < photoSlots.length; i++) {
            let waitTime = (i === 0) ? appConfig.countdownFirst : appConfig.countdownOthers;
            await runCountdown(waitTime);
            triggerFlash();
            await new Promise(r => setTimeout(r, 150)); // let flash peak before capture
            const slot = photoSlots[i];
            await drawPhoto(stripCtx, video, slot.x, slot.y, slot.w, slot.h);
        }

        previewCanvas.width = cWidth;
        previewCanvas.height = cHeight;
        previewCtx.drawImage(stripCanvas, 0, 0);

        $(video).hide();
        $(previewCanvas).show();

        await processAndSaveImage(stripCanvas);
    }

    function computeLayout(fW, fH) {
        const def = LAYOUT_DEFS[appConfig.layout] || LAYOUT_DEFS['4x6-1'];
        const pW = def.pW, pH = def.pH;
        const pad     = Math.round(pW * 0.05);   // side + top padding
        const gap     = Math.round(pW * 0.025);  // gap between photos
        const footerH = Math.round(pH * 0.15);   // polaroid template zone at bottom

        const photoZoneW = pW - 2 * pad;
        const photoZoneH = pH - 2 * pad - footerH;  // photos live above the footer

        const maxPhotoW = Math.floor((photoZoneW - gap * (def.cols - 1)) / def.cols);
        const maxPhotoH = Math.floor((photoZoneH - gap * (def.rows - 1)) / def.rows);
        const slotW = (def.square === false) ? maxPhotoW : Math.min(maxPhotoW, maxPhotoH);
        const slotH = (def.square === false) ? maxPhotoH : slotW;

        // Center the photo grid in the photo zone (above footer)
        const gridW  = slotW * def.cols + gap * (def.cols - 1);
        const gridH  = slotH * def.rows + gap * (def.rows - 1);
        const startX = Math.round((pW - gridW) / 2);
        const startY = Math.round(pad + (photoZoneH - gridH) / 2);

        const photoSlots = [];
        for (let r = 0; r < def.rows; r++) {
            for (let c = 0; c < def.cols; c++) {
                photoSlots.push({
                    x: startX + c * (slotW + gap),
                    y: startY + r * (slotH + gap),
                    w: slotW, h: slotH
                });
            }
        }

        return { cWidth: pW, cHeight: pH, photoSlots };
    }

    // ==================== VIDEO GUESTBOOK ====================
    let _vgMediaRecorder = null;
    let _vgChunks = [];
    let _vgTimerInterval = null;
    let _vgMaxTimer = null;
    let _vgElapsed = 0;

    let _vgFrameAnimId = null; // rAF id for canvas compositing loop
    let _vgSaving = false;     // guard: prevents saveVgVideo from running twice per session

    function stopVgRecordingIfActive() {
        // Null out immediately so a second call (e.g. max-timer + user tap race)
        // cannot call .stop() on the same recorder again.
        const recorder = _vgMediaRecorder;
        _vgMediaRecorder = null;
        if (recorder && recorder.state !== 'inactive') {
            try {
                recorder.stop();
            } catch (e) {
                // If stop() throws (e.g. InvalidStateError), restore the reference
                // so cleanup can still be attempted later.
                _vgMediaRecorder = recorder;
                console.warn('[VG] recorder.stop() threw:', e.message);
            }
        }
        clearInterval(_vgTimerInterval);
        clearTimeout(_vgMaxTimer);
        if (_vgFrameAnimId) { cancelAnimationFrame(_vgFrameAnimId); _vgFrameAnimId = null; }
        const ol = document.getElementById('vg-overlay-live');
        if (ol) { ol.style.display = 'none'; }
    }

    async function triggerVgSequence() {
        $('#vg-booth').show();
        const videoEl = $('#vg-camera-feed')[0];

        // Show live overlay image on viewfinder during recording
        const overlayLive = document.getElementById('vg-overlay-live');
        if (appConfig.vgOverlay) {
            overlayLive.src = appConfig.vgOverlay.objectUrl;
            overlayLive.style.display = '';
        } else {
            overlayLive.style.display = 'none';
            overlayLive.src = '';
        }

        // Show question prompt if enabled
        let _activePromptText = null;
        if (appConfig.vgPromptsEnabled) {
            const _prompts = [
                ...(PROMPT_TEMPLATES[appConfig.vgPromptCategory] || []),
                ...appConfig.vgCustomPrompts
            ];
            if (_prompts.length > 0) {
                _activePromptText = _prompts[Math.floor(Math.random() * _prompts.length)];
                const _secs = Math.max(3, Math.min(10, Math.round(_activePromptText.trim().split(/\s+/).length / 3.3)));
                const _qEl  = document.getElementById('vg-question-overlay');
                const _bar  = document.getElementById('vg-question-timer-bar');
                document.getElementById('vg-question-text').textContent = _activePromptText;
                _bar.style.transition = 'none';
                _bar.style.width = '100%';
                _qEl.style.display = 'flex';
                await new Promise(r => setTimeout(r, 60)); // allow paint before transition starts
                _bar.style.transition = 'width ' + _secs + 's linear';
                _bar.style.width = '0%';
                await new Promise(r => setTimeout(r, _secs * 1000));
                _qEl.style.display = 'none';
            }
        }

        // Show prompt sidebar during countdown (so guest can still read it)
        const _sidebarEl = document.getElementById('vg-prompt-sidebar');
        const _sidebarTxt = document.getElementById('vg-prompt-sidebar-text');
        if (_activePromptText && _sidebarEl) {
            _sidebarTxt.textContent = _activePromptText;
            _sidebarEl.style.display = 'flex';
        }

        // Pre-record countdown
        const cdEl = document.getElementById('vg-countdown-overlay');
        cdEl.style.display = 'flex';
        for (let i = appConfig.vgCountdown; i >= 1; i--) {
            cdEl.textContent = i;
            cdEl.classList.remove('cd-pop');
            void cdEl.offsetWidth; // reflow to restart animation
            cdEl.classList.add('cd-pop');
            _playBeep(i === 1 ? 880 : 660, 0.12); // countdown beep
            await new Promise(r => setTimeout(r, 1000));
        }
        cdEl.style.display = 'none';
        // Sidebar stays visible during recording (it's an HTML overlay — not burned into the video stream)

        // Build the stream to record.
        // If an overlay is configured, composite camera + overlay on a canvas
        // and record the canvas stream (video) + audio from currentStream.
        let recordStream = currentStream;
        if (appConfig.vgOverlay) {
            const canvas = document.getElementById('vg-record-canvas');
            canvas.width  = 1920;
            canvas.height = 1080;
            const ctx = canvas.getContext('2d');
            const overlayImg = appConfig.vgOverlay.img;

            // rAF loop: draw camera frame then overlay
            function compositeFrame() {
                ctx.save();
                // Mirror horizontally to match how selfie cameras appear on screen
                ctx.translate(1920, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(videoEl, 0, 0, 1920, 1080);
                ctx.restore();
                ctx.drawImage(overlayImg, 0, 0, 1920, 1080);
                _vgFrameAnimId = requestAnimationFrame(compositeFrame);
            }
            compositeFrame();

            const canvasVideoStream = canvas.captureStream(30);
            const audioTracks = currentStream.getAudioTracks();
            const combinedStream = new MediaStream([
                ...canvasVideoStream.getVideoTracks(),
                ...audioTracks
            ]);
            recordStream = combinedStream;
        }

        // Start recording
        _vgChunks = [];
        _vgElapsed = 0;
        _vgSaving = false; // reset save guard for this new recording session (also guards against a stale true from a previous session)
        // Prefer mp4 (H.264+AAC) — widest compatibility for saved files.
        // Fall back to webm on browsers that don't support mp4 recording.
        const mimeType = MediaRecorder.isTypeSupported('video/mp4')
            ? 'video/mp4'
            : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
            ? 'video/webm;codecs=vp8,opus'
            : MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
            ? 'video/webm;codecs=vp9,opus'
            : 'video/webm';

        // Explicit bitrate caps prevent the encoder from saturating the CPU.
        // 2.5 Mbps video + 128 kbps audio is more than enough for a guestbook clip.
        const VG_VIDEO_BITRATE = 2500000; // 2.5 Mbps
        const VG_AUDIO_BITRATE = 128000;  // 128 kbps
        const recorderOptions = { mimeType, videoBitsPerSecond: VG_VIDEO_BITRATE, audioBitsPerSecond: VG_AUDIO_BITRATE };
        try {
            _vgMediaRecorder = new MediaRecorder(recordStream, recorderOptions);
        } catch (e) {
            console.warn('[VG] MediaRecorder with bitrate options failed, retrying with mimeType only:', e.message);
            try {
                _vgMediaRecorder = new MediaRecorder(recordStream, { mimeType });
            } catch (e2) {
                console.warn('[VG] MediaRecorder with mimeType failed, using browser defaults:', e2.message);
                _vgMediaRecorder = new MediaRecorder(recordStream);
            }
        }

        _vgMediaRecorder.ondataavailable = function(e) {
            if (e.data && e.data.size > 0) _vgChunks.push(e.data);
        };

        _vgMediaRecorder.onstop = function() {
            // Guard against onstop firing more than once (mobile browser quirk or
            // double-stop race between the max-duration timer and the Stop button).
            if (_vgSaving) return;
            _vgSaving = true;
            clearInterval(_vgTimerInterval);
            clearTimeout(_vgMaxTimer);
            if (_vgFrameAnimId) { cancelAnimationFrame(_vgFrameAnimId); _vgFrameAnimId = null; }
            overlayLive.style.display = 'none';
            $('#vg-prompt-sidebar').hide();
            $('#vg-hud').hide();
            $('#vg-controls').hide();
            $('#vg-processing-overlay').fadeIn(200);
            const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
            const blob = new Blob(_vgChunks, { type: mimeType });
            saveVgVideo(blob, ext);
        };

        _vgMediaRecorder.start(500); // collect chunks every 500ms
        $('#vg-hud').show();
        $('#vg-controls').show();
        // Re-assert prompt sidebar visibility during recording (DOM overlay — not in the recorded stream)
        if (_activePromptText) {
            const _sEl = document.getElementById('vg-prompt-sidebar');
            if (_sEl) _sEl.style.display = 'flex';
        }

        // Update HUD timer every second
        _vgTimerInterval = setInterval(function() {
            _vgElapsed++;
            const mins = Math.floor(_vgElapsed / 60);
            const secs = _vgElapsed % 60;
            $('#vg-timer').text(mins + ':' + String(secs).padStart(2, '0'));
            const left = appConfig.vgMaxDuration - _vgElapsed;
            const mLeft = Math.floor(left / 60);
            const sLeft = left % 60;
            const leftTxt = mLeft > 0 ? mLeft + ':' + String(sLeft).padStart(2, '0') + ' left' : left + 's left';
            $('#vg-time-left').text(leftTxt).css('color', left <= 10 ? '#fca5a5' : '#fff');
        }, 1000);

        // Auto-stop at max duration
        _vgMaxTimer = setTimeout(function() {
            stopVgRecordingIfActive();
        }, appConfig.vgMaxDuration * 1000);
    }

    $('#btn-vg-stop').on('click', function() {
        stopVgRecordingIfActive();
    });

    async function saveVgVideo(blob, ext) {
        // Stop canvas compositing if it was active
        if (_vgFrameAnimId) { cancelAnimationFrame(_vgFrameAnimId); _vgFrameAnimId = null; }

        const now = new Date();
        const ts = now.getFullYear()
            + String(now.getMonth() + 1).padStart(2, '0')
            + String(now.getDate()).padStart(2, '0')
            + '_'
            + String(now.getHours()).padStart(2, '0')
            + String(now.getMinutes()).padStart(2, '0')
            + String(now.getSeconds()).padStart(2, '0');
        const prefix = appConfig.eventName
            ? appConfig.eventName.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
            : 'guestbook';
        const filename = `${prefix}_${ts}.${ext}`;

        // Keep a blob URL in memory for gallery playback (intentionally not revoked)
        const galleryBlobUrl = URL.createObjectURL(blob);
        capturedVideos.unshift(galleryBlobUrl);
        capturedVideoDriveLinks.unshift(null); // will be updated after Drive upload completes
        updateDashboardGallery();
        // Broadcast thumbnail to Live Viewer peers (fire-and-forget)
        lvBroadcastVideo(galleryBlobUrl, filename);

        // Save locally (folder or download)
        if (appConfig.vgSaveLocal) {
            try {
                if (vgDirectoryHandle) {
                    const fileHandle = await vgDirectoryHandle.getFileHandle(filename, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                } else {
                    const dlUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = dlUrl;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(dlUrl), 5000);
                }
            } catch (err) {
                console.error('[VG] Save error:', err);
            }
        }

        // Upload to Google Drive using VG-specific credentials if enabled
        let _vgDriveLink = null;
        if (appConfig.vgSaveDrive && _getVgDriveClientId() && !_getVgDriveClientId().startsWith('YOUR_CLIENT')) {
            uploadVgToDrive(blob, filename).then(async result => {
                if (result && result.id) {
                    await _driveSetPublic(appConfig._vgDriveAccessToken, result.id);
                    _vgDriveLink = `https://drive.google.com/file/d/${result.id}/view`;
                    _currentVgDriveLink = _vgDriveLink;
                    // Store link in gallery parallel array and show QR button in thumbnail
                    capturedVideoDriveLinks[0] = _vgDriveLink;
                    _appendGalleryQrBtn(0, 'video', _vgDriveLink);
                    // Notify live viewer peers
                    lvBroadcastDriveUpdate(filename, _vgDriveLink);
                    // Show QR button if preview is still open
                    if ($('#vg-preview-overlay').is(':visible')) {
                        $('#btn-vg-qr').fadeIn(200);
                    }
                }
            }).catch(e => console.warn('[Drive] VG upload failed:', e.message));
        }

        // Reset HUD state
        $('#vg-time-left').hide().text('');
        $('#vg-timer').text('0:00');
        $('#vg-processing-overlay').fadeOut(200);

        // Show preview with autoplay × 3, then close button
        if (appConfig.vgPreviewEnabled) {
            await showVgPreview(galleryBlobUrl);
        }
        if (appConfig.vgThankYouEnabled) {
            await showVgThankYou();
        }
        $('#vg-booth').hide();
        resetToWelcomeScreen();
    }
    function showVgThankYou() {
        return new Promise(resolve => {
            const overlay  = document.getElementById('vg-thankyou-overlay');
            const bgImg    = document.getElementById('vg-ty-bg-img');
            const gradient = document.getElementById('vg-ty-gradient');
            const doneBtn  = document.getElementById('btn-vg-ty-done');
            const secs     = Math.max(2, appConfig.vgThankYouDuration || 5);

            // Apply background image if configured
            if (appConfig.vgThankYouImage) {
                bgImg.src = appConfig.vgThankYouImage.objectUrl;
                bgImg.style.display = '';
                gradient.style.display = '';
            } else {
                bgImg.style.display = 'none';
                bgImg.src = '';
                gradient.style.display = 'none';
            }

            overlay.style.display = 'flex';
            let timerId = null;

            function advance() {
                clearTimeout(timerId);
                overlay.style.display = 'none';
                doneBtn.removeEventListener('click', advance);
                resolve();
            }

            doneBtn.addEventListener('click', advance);
            timerId = setTimeout(advance, secs * 1000);
        });
    }
    function showVgPreview(blobUrl) {
        return new Promise(resolve => {
            const overlay      = document.getElementById('vg-preview-overlay');
            const video        = document.getElementById('vg-preview-video');
            const closeBtn     = document.getElementById('btn-vg-preview-close');
            const msg          = document.getElementById('vg-preview-msg');
            const seekBar      = document.getElementById('vg-seek-bar');
            const playPauseBtn = document.getElementById('btn-vg-play-pause');
            const muteBtn      = document.getElementById('btn-vg-mute');
            const timeDisplay  = document.getElementById('vg-time-display');
            let loopCount = 0;

            // Reset QR state for this new recording
            _currentVgDriveLink = null;
            $('#btn-vg-qr').hide();

            // Helper: format seconds as M:SS
            function fmtTime(s) {
                if (!isFinite(s)) return '0:00';
                const m = Math.floor(s / 60);
                return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
            }

            video.src = blobUrl;
            video.loop = false;
            video.muted = false;
            seekBar.value = 0;
            timeDisplay.textContent = '0:00 / 0:00';
            playPauseBtn.textContent = '⏸';
            muteBtn.textContent = '🔊';
            msg.style.display = '';
            msg.textContent = 'Playing back your message…';
            overlay.style.display = 'flex';

            // Control bar event handlers
            function onTimeUpdate() {
                if (video.duration) {
                    seekBar.value = (video.currentTime / video.duration) * 100;
                    timeDisplay.textContent = fmtTime(video.currentTime) + ' / ' + fmtTime(video.duration);
                }
            }
            function onLoadedMetadata() {
                seekBar.value = 0;
                timeDisplay.textContent = '0:00 / ' + fmtTime(video.duration);
            }
            function onSeek() {
                if (video.duration) video.currentTime = (seekBar.value / 100) * video.duration;
            }
            function onPlayPause() {
                if (video.paused) { video.play().catch(() => {}); } else { video.pause(); }
            }
            function onPlay()  { playPauseBtn.textContent = '⏸'; }
            function onPause() { playPauseBtn.textContent = '▶'; }
            function onMute() {
                video.muted = !video.muted;
                muteBtn.textContent = video.muted ? '🔇' : '🔊';
            }

            video.addEventListener('timeupdate', onTimeUpdate);
            video.addEventListener('loadedmetadata', onLoadedMetadata);
            video.addEventListener('play', onPlay);
            video.addEventListener('pause', onPause);
            seekBar.addEventListener('input', onSeek);
            playPauseBtn.addEventListener('click', onPlayPause);
            muteBtn.addEventListener('click', onMute);

            function onEnded() {
                loopCount++;
                if (loopCount < 3) {
                    video.currentTime = 0;
                    video.play().catch(() => {});
                } else {
                    msg.style.display = 'none';
                    playPauseBtn.textContent = '▶';
                }
            }
            video.onended = onEnded;

            function doClose() {
                // Remove all control bar listeners
                video.removeEventListener('timeupdate', onTimeUpdate);
                video.removeEventListener('loadedmetadata', onLoadedMetadata);
                video.removeEventListener('play', onPlay);
                video.removeEventListener('pause', onPause);
                seekBar.removeEventListener('input', onSeek);
                playPauseBtn.removeEventListener('click', onPlayPause);
                muteBtn.removeEventListener('click', onMute);
                video.onended = null;
                video.pause();
                video.src = '';
                overlay.style.display = 'none';
                closeBtn.removeEventListener('click', doClose);
                resolve();
            }

            closeBtn.addEventListener('click', doClose);

            video.play().catch(() => {
                msg.textContent = 'Tap play to preview your message.';
                playPauseBtn.textContent = '▶';
            });
        });
    }

    // =========================================================

    /**
     * Capture one photo into the layout slot.
     * Tries ImageCapture.takePhoto() first (full camera sensor resolution — Chrome/Android).
     * Falls back to drawing the current video frame (Safari, Firefox, older browsers).
     */
    async function drawPhoto(ctx, video, x, y, slotW, slotH) {
        let source = null;
        let usedImageCapture = false;

        if (currentStream && typeof ImageCapture !== 'undefined') {
            try {
                const track = currentStream.getVideoTracks()[0];
                const ic = new ImageCapture(track);
                const blob = await ic.takePhoto();
                source = await createImageBitmap(blob);
                usedImageCapture = true;
            } catch (e) {
                console.warn('[drawPhoto] ImageCapture failed, using video frame:', e.message);
                source = null;
            }
        }

        const src = source || video;
        // Support both <video> (videoWidth) and <img> (naturalWidth) sources
        const fW = src.videoWidth  || src.naturalWidth  || src.width;
        const fH = src.videoHeight || src.naturalHeight || src.height;

        const scale = Math.max(slotW / fW, slotH / fH);
        const srcW  = Math.round(slotW / scale);
        const srcH  = Math.round(slotH / scale);
        const srcX  = Math.max(0, Math.round((fW - srcW) / 2));
        const srcY  = Math.max(0, Math.round((fH - srcH) / 2));

        ctx.save();
        // Mirror horizontally for selfie/getUserMedia cameras.
        ctx.translate(x + slotW, y);
        ctx.scale(-1, 1);
        ctx.drawImage(src, srcX, srcY, srcW, srcH, 0, 0, slotW, slotH);
        ctx.restore();

        if (usedImageCapture && source instanceof ImageBitmap) {
            source.close(); // free GPU memory immediately
        }
    }

    async function processAndSaveImage(canvas) {
        $('#processing-overlay').fadeIn(200);

        const filename = makeFilename();

        // --- Save to local folder (or browser download as fallback) ---
        if (appConfig.saveLocal) {
            try {
                if (directoryHandle) {
                    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1.0));
                    const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                } else {
                    const dataUrl = canvas.toDataURL('image/png', 1.0);
                    const downloadLink = document.createElement('a');
                    downloadLink.href = dataUrl;
                    downloadLink.download = filename;
                    document.body.appendChild(downloadLink);
                    downloadLink.click();
                    document.body.removeChild(downloadLink);
                }
            } catch (err) { console.error('Save error:', err); }
        }

        // Print BEFORE showing preview
        if (appConfig.photoMode) {
            $('#processing-overlay h2').text('Sending to printer…');
            await printCanvas(canvas);
            $('#processing-overlay h2').text('Processing...');
        }

        // SAVE IMAGE TO ADMIN DASHBOARD GALLERY
        const photoDataUrl = canvas.toDataURL('image/png', 0.8);
        capturedPhotos.unshift(photoDataUrl);
        capturedPhotoDriveLinks.unshift(null); // will be updated after Drive upload completes
        updateDashboardGallery();
        // Broadcast to Live Viewer peers (fire-and-forget)
        lvBroadcastPhoto(photoDataUrl, filename);

        // --- Upload to Google Drive (fire-and-forget, non-blocking) ---
        // Store the Drive link so QR button can use it when upload completes
        let _pbDriveLink = null;
        if (appConfig.saveDrive && _getDriveClientId() && !_getDriveClientId().startsWith('YOUR_CLIENT')) {
            canvas.toBlob(async function(blob) {
                try {
                    const result = await uploadToDrive(blob, filename);
                    console.log('[Drive] Uploaded:', filename);
                    if (result && result.id) {
                        // Make the file publicly readable so guests can download via QR
                        await _driveSetPublic(appConfig._driveAccessToken, result.id);
                        _pbDriveLink = `https://drive.google.com/file/d/${result.id}/view`;
                        // Store link in gallery parallel array and show QR button in thumbnail
                        capturedPhotoDriveLinks[0] = _pbDriveLink;
                        _appendGalleryQrBtn(0, 'photo', _pbDriveLink);
                        // Notify live viewer peers
                        lvBroadcastDriveUpdate(filename, _pbDriveLink);
                        // Show QR button in share overlay (if it's still open)
                        if ($('#share-overlay').is(':visible') && _pbDriveLink) {
                            _currentPbDriveLink = _pbDriveLink;
                            $('#btn-share-qr').fadeIn(200);
                        }
                    }
                } catch (e) {
                    console.warn('[Drive] Upload failed:', e.message);
                }
            }, 'image/jpeg', 0.92);
        }

        $('#processing-overlay').fadeOut(200);

        if (appConfig.socialShare) {
            showShareOverlay(canvas, photoDataUrl);
        } else {
            const previewMs = Math.max(appConfig.reviewTime * 1000, 1000);
            setTimeout(() => {
                $('#processing-overlay h2').text('Processing...');
                $('.spinner').show();
                resetToWelcomeScreen();
            }, previewMs);
        }
    }

    async function printCanvas(sourceCanvas) {
        const paperKey = appConfig.paperSizeOverride !== 'auto'
            ? appConfig.paperSizeOverride
            : (LAYOUT_DEFS[appConfig.layout]?.paper || '4x6');
        const paper = PAPER_SIZES[paperKey];

        // Create a print canvas at the physical Selphy paper dimensions
        const printC = document.createElement('canvas');
        printC.width  = paper.pWpx;
        printC.height = paper.pHpx;
        const pCtx = printC.getContext('2d');
        pCtx.fillStyle = '#ffffff';
        pCtx.fillRect(0, 0, paper.pWpx, paper.pHpx);
        if (appConfig.colorMode === 'grayscale') {
            pCtx.filter = 'grayscale(100%)';
        }

        if (paper.twoUp) {
            // 2-up: draw two strips side-by-side on Wide paper — user cuts in half
            const vMargin = Math.round((paper.pHpx - paper.hPx) / 2);
            pCtx.drawImage(sourceCanvas, 0,          vMargin, paper.wPx, paper.hPx);
            pCtx.drawImage(sourceCanvas, paper.wPx,  vMargin, paper.wPx, paper.hPx);
        } else {
            // Contain-fit: scale source to fill physical paper, centred
            const scale = Math.min(paper.pWpx / sourceCanvas.width, paper.pHpx / sourceCanvas.height);
            const dW = Math.round(sourceCanvas.width  * scale);
            const dH = Math.round(sourceCanvas.height * scale);
            const dX = Math.round((paper.pWpx - dW) / 2);
            const dY = Math.round((paper.pHpx - dH) / 2);
            pCtx.drawImage(sourceCanvas, dX, dY, dW, dH);
        }
        pCtx.filter = 'none';

        const margin = appConfig.borderless ? '0' : '3mm';
        const blob = await new Promise(r => printC.toBlob(r, 'image/jpeg', 0.95));
        const url  = URL.createObjectURL(blob);

        for (let copy = 0; copy < appConfig.printCopies; copy++) {
            if (appConfig.printMode === 'server' && appConfig.printServer) {
                await postToPrintServer(blob, paper);
            } else {
                await triggerPrintJob(url, paper, margin);
            }
            if (copy < appConfig.printCopies - 1) await new Promise(r => setTimeout(r, 1500));
        }
        URL.revokeObjectURL(url);
    }

    // POST the photo blob to a local WiFi print server
    async function postToPrintServer(blob, paper) {
        const form = new FormData();
        form.append('photo', blob, 'photo.jpg');
        form.append('paperW', paper.cssW);
        form.append('paperH', paper.cssH);
        form.append('colorMode', appConfig.colorMode);
        form.append('borderless', appConfig.borderless ? '1' : '0');
        const url = appConfig.printServer.replace(/\/$/, '') + '/print';
        const resp = await fetch(url, { method: 'POST', body: form });
        if (!resp.ok) {
            const msg = await resp.text().catch(() => resp.status);
            throw new Error('Print server error: ' + msg);
        }
        return resp.json();
    }

    // Check if the print server is reachable; returns { ok, version? } or throws
    async function checkPrintServer() {
        const url = appConfig.printServer.replace(/\/$/, '') + '/status';
        const resp = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
    }

    async function triggerPrintJob(url, paper, margin) {
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;border:0;';
        document.body.appendChild(iframe);
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(`<!DOCTYPE html><html><head><style>
            @page { size: ${paper.cssW} ${paper.cssH}; margin: ${margin}; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { width: ${paper.cssW}; height: ${paper.cssH}; overflow: hidden; background: #fff; }
            img { width: 100%; height: 100%; display: block; object-fit: fill; }
        </style></head><body><img src="${url}"></body></html>`);
        doc.close();
        await new Promise(r => { iframe.onload = r; setTimeout(r, 800); });
        iframe.contentWindow.print();
        setTimeout(() => { if (iframe.parentNode) document.body.removeChild(iframe); }, 10000);
    }

    async function printTestPage() {
        const paperKey = appConfig.paperSizeOverride !== 'auto'
            ? appConfig.paperSizeOverride
            : (LAYOUT_DEFS[appConfig.layout]?.paper || '4x6');
        const paper = PAPER_SIZES[paperKey];
        const tc = document.createElement('canvas');
        tc.width = paper.pWpx; tc.height = paper.pHpx;
        const ctx = tc.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, tc.width, tc.height);
        ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 6;
        ctx.strokeRect(20, 20, tc.width - 40, tc.height - 40);
        const fs1 = Math.round(paper.pWpx * 0.08);
        const fs2 = Math.round(paper.pWpx * 0.045);
        ctx.fillStyle = '#1f2937'; ctx.textAlign = 'center'; ctx.font = `bold ${fs1}px Inter,sans-serif`;
        ctx.fillText('Test Print', tc.width / 2, tc.height * 0.35);
        ctx.fillStyle = '#6b7280'; ctx.font = `${fs2}px Inter,sans-serif`;
        ctx.fillText(paper.label, tc.width / 2, tc.height * 0.48);
        ctx.fillText(appConfig.colorMode === 'grayscale' ? 'B&W' : 'Color', tc.width / 2, tc.height * 0.56);
        ctx.fillText(new Date().toLocaleString(), tc.width / 2, tc.height * 0.64);
        await printCanvas(tc);
    }

    function updatePaperMappingInfo() {
        const layout = $('input[name="layout"]:checked').val() || appConfig.layout;
        const override = appConfig.paperSizeOverride;
        const autoKey = LAYOUT_DEFS[layout]?.paper || '4x6';
        const activeKey = override !== 'auto' ? override : autoKey;
        const paper = PAPER_SIZES[activeKey];
        if (!paper) return;
        const source = override !== 'auto' ? 'manual override' : 'layout default';
        $('#paper-mapping-info').html(
            `<span class="info-tag">Active paper:</span> <strong>${paper.label}</strong> &mdash; <span style="color:#6b7280;">${paper.selphy} &middot; ${source}</span>`
        );
    }

    function updateTemplateSizeHint() {
        const layout = $('input[name="layout"]:checked').val() || appConfig.layout;
        const def = LAYOUT_DEFS[layout] || LAYOUT_DEFS['4x6-1'];
        const paper = PAPER_SIZES[def.paper];
        const sizeStr = def.pW + ' × ' + def.pH + ' px';
        $('#hint-layout-name').text(def.name);
        $('#hint-canvas-size').text(sizeStr);
        $('#hint-paper').text(paper ? paper.selphy : '');
        $('#bg-size-hint').text(sizeStr);
        $('#template-canvas-label').text(def.name);
        drawTemplatePreview();
    }

    function drawTemplatePreview() {
        const canvas = document.getElementById('template-preview-canvas');
        if (!canvas) return;
        const layout = $('input[name="layout"]:checked').val() || appConfig.layout;
        const def = LAYOUT_DEFS[layout] || LAYOUT_DEFS['4x6-1'];
        // Scale down to 260px tall
        const maxH  = 260;
        const scale = maxH / def.pH;
        canvas.width  = Math.round(def.pW * scale);
        canvas.height = maxH;
        const ctx = canvas.getContext('2d');
        // Background
        if (appConfig.templateBg) {
            ctx.drawImage(appConfig.templateBg, 0, 0, canvas.width, canvas.height);
        } else {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        // Geometry (mirrors computeLayout, scaled)
        const pad     = Math.round(def.pW * 0.05  * scale);
        const gap     = Math.round(def.pW * 0.025 * scale);
        const footerH = Math.round(def.pH * 0.15  * scale);  // polaroid footer zone
        const photoZoneW = canvas.width  - 2 * pad;
        const photoZoneH = canvas.height - 2 * pad - footerH;
        const maxPhotoW  = Math.floor((photoZoneW - gap * (def.cols - 1)) / def.cols);
        const maxPhotoH  = Math.floor((photoZoneH - gap * (def.rows - 1)) / def.rows);
        const slotW  = (def.square === false) ? maxPhotoW : Math.min(maxPhotoW, maxPhotoH);
        const slotH  = (def.square === false) ? maxPhotoH : slotW;
        const gridW  = slotW * def.cols + gap * (def.cols - 1);
        const gridH  = slotH * def.rows + gap * (def.rows - 1);
        const startX = Math.round((canvas.width  - gridW) / 2);
        const startY = Math.round(pad + (photoZoneH - gridH) / 2);
        // Photo slot placeholders
        const bgColors = ['#e2e8f0', '#f1f5f9', '#dde6ef', '#eef2f6'];
        let si = 0;
        for (let r = 0; r < def.rows; r++) {
            for (let c = 0; c < def.cols; c++, si++) {
                const px = startX + c * (slotW + gap);
                const py = startY + r * (slotH + gap);
                ctx.fillStyle = bgColors[si % bgColors.length];
                ctx.fillRect(px, py, slotW, slotH);
                ctx.fillStyle = '#94a3b8';
                ctx.font = Math.max(8, Math.round(slotW * 0.38)) + 'px serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('📷', px + slotW / 2, py + slotH / 2);
            }
        }
        // Footer zone indicator (dashed line + tint when no background is loaded)
        const footerY = canvas.height - footerH;
        if (!appConfig.templateBg) {
            ctx.fillStyle = 'rgba(148,163,184,0.12)';
            ctx.fillRect(0, footerY, canvas.width, footerH);
        }
        ctx.save();
        ctx.strokeStyle = 'rgba(148,163,184,0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(0, footerY);
        ctx.lineTo(canvas.width, footerY);
        ctx.stroke();
        ctx.restore();
        ctx.textBaseline = 'alphabetic';
    }

    // ==================== AUDIO BEEPS ====================
    let _audioCtx = null;
    function _getAudioCtx() {
        if (!_audioCtx || _audioCtx.state === 'closed') {
            _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (_audioCtx.state === 'suspended') _audioCtx.resume();
        return _audioCtx;
    }
    function _playBeep(freq, duration, volume) {
        try {
            const ctx = _getAudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(volume || 0.45, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + duration);
        } catch (e) { /* audio not available */ }
    }
    // =========================================================

    function runCountdown(seconds) {
        return new Promise(resolve => {
            let count = seconds;
            const overlay = $('#countdown-overlay');
            // Reset state before starting so previous transition doesn't linger
            overlay.removeClass('active').hide();
            void overlay[0].offsetWidth;
            overlay.text(count).show();
            _playBeep(count === 1 ? 880 : 660, 0.12); // beep on initial display
            requestAnimationFrame(() => overlay.addClass('active'));
            
            const interval = setInterval(() => {
                count--;
                if (count > 0) {
                    overlay.removeClass('active');
                    void overlay[0].offsetWidth; 
                    overlay.text(count).addClass('active');
                    _playBeep(count === 1 ? 880 : 660, 0.12); // beep on each number
                } else {
                    clearInterval(interval);
                    overlay.removeClass('active');
                    _playBeep(1100, 0.08); // shutter beep
                    // Resolve only AFTER hide so next countdown never races with this one
                    setTimeout(() => { overlay.hide(); resolve(); }, 250);
                }
            }, 1000);
        });
    }

    function triggerFlash() {
        const flash = $('#flash-overlay');
        flash.show().css('opacity', '1').animate({ opacity: 0 }, 300, 'linear', function() {
            $(this).hide();
        });
    }

    // --- Dashboard Gallery UI Engine ---
    function updateDashboardGallery() {
        const total = capturedPhotos.length + capturedVideos.length;
        $('#stat-captures').text(total);
        $('#count-photos').text(capturedPhotos.length);
        $('#count-videos').text(capturedVideos.length);

        // --- Photo grid ---
        const photoGrid = $('#dashboard-gallery-photo');
        photoGrid.empty();
        if (capturedPhotos.length === 0) {
            photoGrid.append('<div class="empty-gallery">No photos yet. Launch the Kiosk to start a session!</div>');
        } else {
            capturedPhotos.slice(0, 8).forEach((src, index) => {
                const num = capturedPhotos.length - index;
                const driveLink = capturedPhotoDriveLinks[index] || null;
                const qrBtn = driveLink
                    ? `<button class="gallery-qr-btn" data-url="${driveLink}" title="Get QR code to download"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/><rect x="14" y="18" width="3" height="0"/></svg>QR</button>`
                    : '';
                photoGrid.append(`<div class="gallery-item" data-index="${index}" title="Photo #${num}"><img src="${src}" alt="Photo #${num}"><div class="overlay">Photo #${num}</div>${qrBtn}</div>`);
            });
        }

        // --- Video grid ---
        const videoGrid = $('#dashboard-gallery-video');
        videoGrid.empty();
        if (capturedVideos.length === 0) {
            videoGrid.append('<div class="empty-gallery">No videos yet. Switch to Video Guestbook mode and record a message!</div>');
        } else {
            capturedVideos.slice(0, 8).forEach((src, index) => {
                const num = capturedVideos.length - index;
                const driveLink = capturedVideoDriveLinks[index] || null;
                const qrBtn = driveLink
                    ? `<button class="gallery-qr-btn" data-url="${driveLink}" title="Get QR code to download"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/><rect x="14" y="18" width="3" height="0"/></svg>QR</button>`
                    : '';
                videoGrid.append(`
                    <div class="gallery-item gallery-item-video" data-vindex="${index}" title="Video #${num}">
                        <video src="${src}" preload="metadata" muted playsinline></video>
                        <div class="gallery-play-icon">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        </div>
                        <div class="overlay">Video #${num}</div>
                        ${qrBtn}
                    </div>`);
            });
        }

        // --- Dashboard gallery tab switching ---
        $(document).off('click.galtabs').on('click.galtabs', '[data-gallery-tab]', function() {
            const target = $(this).data('gallery-tab');
            $(this).closest('.gallery-section').find('[data-gallery-tab]').removeClass('active');
            $(this).addClass('active');
            $(this).closest('.gallery-section').find('.gallery-tab-content').hide();
            $('#' + target).show();
        });
    }

    // Append (or show) a QR button on an existing gallery thumbnail without full re-render
    function _appendGalleryQrBtn(arrIndex, type, driveLink) {
        if (!driveLink) return;
        const selector = type === 'video'
            ? `.gallery-item[data-vindex="${arrIndex}"]`
            : `.gallery-item[data-index="${arrIndex}"]`;
        const $item = $(selector);
        if ($item.length && !$item.find('.gallery-qr-btn').length) {
            $item.append(`<button class="gallery-qr-btn" data-url="${driveLink}" title="Get QR code to download"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/></svg>QR</button>`);
        }
    }

    // --- Gallery lightbox ---
    let _lightboxIdx = 0;
    let _lightboxType = 'photo'; // 'photo' | 'video'

    function _lightboxItems() {
        return _lightboxType === 'video' ? capturedVideos : capturedPhotos;
    }

    function _renderLightbox() {
        const items = _lightboxItems();
        const isVideo = _lightboxType === 'video';
        if (isVideo) {
            $('#lightbox-img').hide();
            const vid = $('#lightbox-video');
            vid.attr('src', items[_lightboxIdx]).show();
            vid[0].load();
        } else {
            $('#lightbox-video').hide().attr('src', '');
            $('#lightbox-img').attr('src', items[_lightboxIdx]).show();
        }
        $('#lightbox-counter').text((_lightboxIdx + 1) + ' / ' + items.length);
        $('#lightbox-prev').toggle(_lightboxIdx > 0);
        $('#lightbox-next').toggle(_lightboxIdx < items.length - 1);
    }
    function openLightbox(idx) {
        _lightboxType = 'photo';
        _lightboxIdx = idx;
        _renderLightbox();
        $('#photo-lightbox').fadeIn(200);
    }
    function openVideoLightbox(idx) {
        _lightboxType = 'video';
        _lightboxIdx = idx;
        _renderLightbox();
        $('#photo-lightbox').fadeIn(200);
    }
    // QR button on gallery thumbnails — stop propagation so lightbox doesn't open
    $(document).on('click', '.gallery-qr-btn', function(e) {
        e.stopPropagation();
        const url = $(this).data('url');
        if (url) showQrOverlay(url, 'Scan to download your copy');
    });
    $(document).on('click', '.gallery-item:not(.gallery-item-video)', function() {
        openLightbox(parseInt($(this).data('index')));
    });
    $(document).on('click', '.gallery-item.gallery-item-video', function() {
        openVideoLightbox(parseInt($(this).data('vindex')));
    });
    $(document).on('click', '#lightbox-close, #photo-lightbox-backdrop', function() {
        const vid = document.getElementById('lightbox-video');
        if (vid) vid.pause();
        $('#photo-lightbox').fadeOut(200);
    });
    $('#lightbox-prev').on('click', function(e) {
        e.stopPropagation();
        if (_lightboxIdx > 0) { _lightboxIdx--; _renderLightbox(); }
    });
    $('#lightbox-next').on('click', function(e) {
        e.stopPropagation();
        if (_lightboxIdx < _lightboxItems().length - 1) { _lightboxIdx++; _renderLightbox(); }
    });

    // --- Lightbox swipe (touch) ---
    (function() {
        let _tsX = null, _tsY = null;
        const lb = document.getElementById('photo-lightbox');
        lb.addEventListener('touchstart', function(e) {
            _tsX = e.touches[0].clientX;
            _tsY = e.touches[0].clientY;
        }, { passive: true });
        lb.addEventListener('touchend', function(e) {
            if (_tsX === null) return;
            const dx = e.changedTouches[0].clientX - _tsX;
            const dy = e.changedTouches[0].clientY - _tsY;
            _tsX = null; _tsY = null;
            if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
            const items = _lightboxItems();
            if (dx < 0 && _lightboxIdx < items.length - 1) { _lightboxIdx++; _renderLightbox(); }
            else if (dx > 0 && _lightboxIdx > 0) { _lightboxIdx--; _renderLightbox(); }
        }, { passive: true });
    })();

    // --- Full gallery modal ---
    function openGalleryModal() {
        // Photo grid
        const photoGrid = $('#gallery-modal-grid');
        photoGrid.empty();
        if (capturedPhotos.length === 0) {
            photoGrid.append('<div class="empty-gallery">No photos captured yet.</div>');
        } else {
            capturedPhotos.forEach((src, idx) => {
                const num = capturedPhotos.length - idx;
                photoGrid.append(`<div class="gallery-modal-item" data-index="${idx}"><img src="${src}" alt="Photo #${num}"><div class="overlay">Photo #${num}</div></div>`);
            });
        }
        // Video grid
        const videoGrid = $('#gallery-modal-grid-video');
        videoGrid.empty();
        if (capturedVideos.length === 0) {
            videoGrid.append('<div class="empty-gallery">No videos captured yet.</div>');
        } else {
            capturedVideos.forEach((src, idx) => {
                const num = capturedVideos.length - idx;
                videoGrid.append(`
                    <div class="gallery-modal-item gallery-modal-item-video" data-vindex="${idx}" title="Video #${num}">
                        <video src="${src}" preload="metadata" muted playsinline></video>
                        <div class="gallery-play-icon">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        </div>
                        <div class="overlay">Video #${num}</div>
                    </div>`);
            });
        }
        const total = capturedPhotos.length + capturedVideos.length;
        $('#gallery-modal-count').text('(' + total + ')');
        $('#gallery-modal').fadeIn(200);

        // Modal tab switching
        $(document).off('click.modaltabs').on('click.modaltabs', '[data-modal-tab]', function() {
            const target = $(this).data('modal-tab');
            $('#gallery-modal').find('[data-modal-tab]').removeClass('active');
            $(this).addClass('active');
            $('.gallery-modal-tab-content').hide();
            $('#' + target).show();
        });
    }
    $('#btn-view-all-gallery').on('click', function(e) { e.preventDefault(); openGalleryModal(); });
    $('#gallery-modal-close, #gallery-modal-backdrop').on('click', function() { $('#gallery-modal').fadeOut(200); });
    $(document).on('click', '.gallery-modal-item:not(.gallery-modal-item-video)', function() {
        $('#gallery-modal').fadeOut(150);
        openLightbox(parseInt($(this).data('index')));
    });
    $(document).on('click', '.gallery-modal-item.gallery-modal-item-video', function() {
        $('#gallery-modal').fadeOut(150);
        openVideoLightbox(parseInt($(this).data('vindex')));
    });

    // --- Event Name handlers ---
    function _updateFilenamePreview() {
        const name = appConfig.eventName || 'photobooth';
        const safe = name.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'photobooth';
        $('#filename-preview').text(safe + '_YYYYMMDD_HHMMSS.png');
    }

    // Show/hide inline warning below the event name field when Drive is on but name is empty
    function _updateEventNameWarnings() {
        const needsName = (appConfig.saveDrive || appConfig.vgSaveDrive) && !appConfig.eventName;
        $('#event-name-drive-warning').toggle(needsName);
        $('#event-name-input').toggleClass('input-required-highlight', needsName);
    }
    $('#event-name-input, #wiz-event-name').on('input', function() {
        appConfig.eventName = this.value.trim();
        $('#event-name-input, #wiz-event-name').val(appConfig.eventName);
        // Reset event sub-folder cache so the new name creates a fresh sub-folder
        appConfig._driveEventFolderId = null;
        appConfig._vgDriveEventFolderId = null;
        _updateFilenamePreview();
        _updateEventNameWarnings();
    });

    // =============================================
    // SETUP WIZARD
    // =============================================
    let wizStep = 1;
    const WIZ_TOTAL = 5;

    function wizGo(step) {
        wizStep = step;
        $('.wiz-step-item').each(function() {
            const s = parseInt($(this).data('s'));
            $(this).toggleClass('active', s === step).toggleClass('done', s < step);
        });
        $('.wstep').hide();
        $('#wstep-' + step).show();
        $('#wiz-back').toggle(step > 1);
        if (step === WIZ_TOTAL) {
            $('#wiz-next').hide();
        } else {
            $('#wiz-next').show();
        }
    }

    function wizDone() {
        localStorage.setItem('pb-setup-done', '1');
        $('#setup-wizard').fadeOut(300);
        $('#admin-dashboard').fadeIn(300);
    }

    // First-launch check
    if (!localStorage.getItem('pb-setup-done')) {
        $('#admin-dashboard').hide();
        $('#setup-wizard').fadeIn(300);
        wizGo(1);
    } else {
        $('#setup-wizard').hide();
    }

    $('#wiz-next').on('click', function() { if (wizStep < WIZ_TOTAL) wizGo(wizStep + 1); });
    $('#wiz-back').on('click', function() { if (wizStep > 1) wizGo(wizStep - 1); });
    $('#wiz-skip').on('click', function() { wizDone(); });
    $('#wiz-go-dashboard').on('click', function(e) { e.preventDefault(); wizDone(); });

    // Step 1: Layout — same name="layout" radio group; existing change handler already syncs appConfig + paper info

    // Step 2: Template background
    $('#wiz-btn-pick-bg').on('click', () => $('#wiz-bg-input').trigger('click'));
    $('#wiz-bg-empty').on('click', function(e) {
        if (!$(e.target).is('button')) $('#wiz-bg-input').trigger('click');
    });
    $('#wiz-bg-input').on('change', async function() {
        if (this.files[0]) {
            const file = this.files[0];
            await applyBgImage(file);
            if (appConfig.templateBg) {
                $('#wiz-bg-thumb').attr('src', appConfig.templateBg.src);
                $('#wiz-bg-filename').text(file.name);
                $('#wiz-bg-dims').text(appConfig.templateBg.naturalWidth + ' × ' + appConfig.templateBg.naturalHeight + ' px');
                $('#wiz-bg-empty').hide();
                $('#wiz-bg-preview').show();
            }
        }
        this.value = '';
    });
    $('#wiz-btn-clear-bg').on('click', function() {
        appConfig.templateBg = null;
        $('#bg-preview-state').hide();
        $('#bg-empty-state').show();
        $('#wiz-bg-preview').hide();
        $('#wiz-bg-empty').show();
        drawTemplatePreview();
    });
    const wizBgZone = document.getElementById('wiz-bg-zone');
    if (wizBgZone) {
        wizBgZone.addEventListener('dragover', e => { e.preventDefault(); wizBgZone.classList.add('drag-over'); });
        wizBgZone.addEventListener('dragleave', () => wizBgZone.classList.remove('drag-over'));
        wizBgZone.addEventListener('drop', async e => {
            e.preventDefault();
            wizBgZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (!file || !file.type.match(/image\/(jpeg|png)/)) return;
            await applyBgImage(file);
            if (appConfig.templateBg) {
                $('#wiz-bg-thumb').attr('src', appConfig.templateBg.src);
                $('#wiz-bg-filename').text(file.name);
                $('#wiz-bg-dims').text(appConfig.templateBg.naturalWidth + ' × ' + appConfig.templateBg.naturalHeight + ' px');
                $('#wiz-bg-empty').hide();
                $('#wiz-bg-preview').show();
            }
        });
    }

    // Step 3: Timing sliders
    $('#wiz-cd-1').on('input', function() {
        const v = $(this).val();
        $('#wiz-val-cd-1').text(v + 's');
        appConfig.countdownFirst = parseInt(v);
        $('#setting-cd-1').val(v);
        $('#val-cd-1').text(v);
    });
    $('#wiz-cd-others').on('input', function() {
        const v = $(this).val();
        $('#wiz-val-cd-others').text(v + 's');
        appConfig.countdownOthers = parseInt(v);
        $('#setting-cd-others').val(v);
        $('#val-cd-others').text(v);
    });
    $('#wiz-review').on('input', function() {
        const v = $(this).val();
        $('#wiz-val-review').text(v + 's');
        appConfig.reviewTime = parseInt(v);
        $('#setting-review').val(v);
        $('#val-review').text(v);
    });

    // Step 4: Welcome screen
    $('#wiz-ws-color').on('input', function() {
        const col = $(this).val();
        $('#wiz-ws-color-hex').text(col);
        appConfig.welcomeBg = col;
        $('#edit-bg-color').val(col);
        $('#color-hex').text(col);
        if (!appConfig.welcomeMedia) {
            $('#designer-preview').css('background-color', col);
            $('#guest-welcome').css('background-color', col);
            $('#wiz-ws-preview').css('background-color', col);
        }
    });
    $('#wiz-ws-title').on('input', function() {
        const txt = $(this).val();
        appConfig.welcomeTitle = txt;
        $('#edit-title').val(txt);
        $('#prev-title, #live-ws-title, #wiz-prev-title').text(txt);
    });
    $('#wiz-ws-subtitle').on('input', function() {
        const txt = $(this).val();
        appConfig.welcomeSubtitle = txt;
        $('#edit-subtitle').val(txt);
        $('#prev-subtitle, #live-ws-subtitle, #wiz-prev-subtitle').text(txt);
    });

    function syncWizWelcomeMediaUI(type, objectUrl) {
        const thumbWrap = $('#wiz-ws-thumb-wrap').empty();
        if (type === 'video') {
            thumbWrap.html(`<video src="${objectUrl}" class="ws-thumb-media" autoplay loop muted playsinline></video>`);
        } else {
            thumbWrap.html(`<img src="${objectUrl}" class="ws-thumb-media">`);
        }
        $('#wiz-ws-media-empty').hide();
        $('#wiz-ws-media-filled').show();
        if (type === 'video') {
            $('#wiz-prev-media-img').hide().attr('src', '');
            const pv = $('#wiz-prev-media-video').attr('src', objectUrl).show()[0];
            pv.load(); pv.play();
        } else {
            const wv = $('#wiz-prev-media-video').hide().attr('src', '')[0];
            if (wv) wv.load();
            $('#wiz-prev-media-img').attr('src', objectUrl).show();
        }
        $('#wiz-ws-preview').css('background-color', '');
    }

    $('#wiz-ws-media-drop').on('click', function(e) {
        if (!$(e.target).closest('#wiz-ws-media-remove, #wiz-btn-pick-media').length) {
            document.getElementById('wiz-ws-media-input').click();
        }
    });
    $('#wiz-btn-pick-media').on('click', function(e) {
        e.stopPropagation();
        document.getElementById('wiz-ws-media-input').click();
    });
    $('#wiz-ws-media-input').on('change', function() {
        const file = this.files[0];
        if (file) {
            applyWelcomeMedia(file);
            syncWizWelcomeMediaUI(appConfig.welcomeMedia.type, appConfig.welcomeMedia.objectUrl);
        }
    });
    $('#wiz-ws-media-drop').on('dragover dragenter', function(e) {
        e.preventDefault(); e.stopPropagation();
        $(this).addClass('drag-over');
    }).on('dragleave drop', function(e) {
        e.preventDefault(); e.stopPropagation();
        $(this).removeClass('drag-over');
        if (e.type === 'drop') {
            const file = e.originalEvent.dataTransfer.files[0];
            if (file && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
                applyWelcomeMedia(file);
                syncWizWelcomeMediaUI(appConfig.welcomeMedia.type, appConfig.welcomeMedia.objectUrl);
            }
        }
    });
    $('#wiz-ws-media-remove').on('click', function(e) {
        e.stopPropagation();
        clearWelcomeMedia();
        $('#wiz-ws-media-empty').show();
        $('#wiz-ws-media-filled').hide();
        $('#wiz-ws-thumb-wrap').empty();
        const wv = $('#wiz-prev-media-video').hide().attr('src', '')[0];
        if (wv) wv.load();
        $('#wiz-prev-media-img').hide().attr('src', '');
        $('#wiz-ws-preview').css('background-color', appConfig.welcomeBg);
    });

    // Step 5: Storage
    $('input[name="wiz-storage"]').on('change', function() {
        const val = $(this).val();
        const isLocal = val === 'local';
        appConfig.saveLocal = isLocal;
        $('#chk-save-local').prop('checked', isLocal);
        const showFolder = isLocal;
        $('#wiz-folder-config').toggle(showFolder);
        if (showFolder) { $('#local-folder-config').slideDown(); }
        else { $('#local-folder-config').slideUp(); }
    });
    $('#wiz-btn-select-dir').on('click', function() {
        $('#btn-select-dir').trigger('click');
    });

    // Launch kiosk from wizard
    $('#wiz-launch-kiosk').on('click', function() {
        wizDone();
        $('#btn-launch-booth').trigger('click');
    });

    // =========================================================
    // LIVE GALLERY VIEWER  (WebRTC / PeerJS peer-to-peer)
    // =========================================================
    // Protocol messages sent over DataChannel:
    //   { type:'photo',  data:<dataURL>,       filename:<str>, ts:<ms> }
    //   { type:'video',  data:<thumbDataURL>,  filename:<str>, ts:<ms>, duration:<secs> }
    //   { type:'hello',  eventName:<str> }       — sent on new connection
    //   { type:'ping' }

    let _lvPeer        = null;   // Peer instance (host mode)
    let _lvConns       = [];     // array of active DataConnection objects
    let _lvSentCount   = 0;
    const LV_CHUNK_MAX = 16384; // DataChannel safe chunk size (16 KB)

    // ── Host mode ──────────────────────────────────────────────
    function _lvStart() {
        if (typeof Peer === 'undefined') {
            alert('PeerJS library has not loaded yet. Check your internet connection and try again.');
            return;
        }
        _lvPeer = new Peer(); // uses free peerjs.com cloud signaling
        _lvPeer.on('open', function(id) {
            // Use admin-configured network address so other devices can reach this URL.
            // If blank, fall back to window.location (works for same-browser testing only).
            const addr = (appConfig.lvNetworkAddr || '').trim().replace(/\/+$/, '');
            const viewerUrl = addr
                ? addr + window.location.pathname + '?viewer=' + id
                : window.location.origin + window.location.pathname + '?viewer=' + id;
            $('#lv-viewer-url').text(viewerUrl);
            // Render QR code
            $('#lv-qr-container').empty();
            new QRCode(document.getElementById('lv-qr-container'), {
                text: viewerUrl,
                width: 164,
                height: 164,
                colorDark: '#1e293b',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.M
            });
            $('#lv-idle-state').hide();
            $('#lv-active-state').show();
            _lvSetStatus('Waiting for viewer…', false);
        });

        _lvPeer.on('connection', function(conn) {
            conn.on('open', function() {
                if (_lvConns.includes(conn)) return; // guard: some browsers fire 'open' twice
                _lvConns.push(conn);
                _lvSetStatus(_lvConns.length + ' viewer' + (_lvConns.length > 1 ? 's' : '') + ' connected', true);
                // Send current event name so viewer shows it in the header
                conn.send(JSON.stringify({ type: 'hello', eventName: appConfig.eventName || '' }));
            });
            conn.on('close', function() {
                _lvConns = _lvConns.filter(c => c !== conn);
                const n = _lvConns.length;
                _lvSetStatus(n > 0 ? n + ' viewer' + (n > 1 ? 's' : '') + ' connected' : 'Waiting for viewer…', n > 0);
            });
            conn.on('error', function() {
                _lvConns = _lvConns.filter(c => c !== conn);
            });
        });

        _lvPeer.on('error', function(err) {
            console.warn('[LiveViewer] PeerJS error:', err.type, err.message);
            _lvSetStatus('Connection error: ' + err.type, false);
        });
    }

    function _lvStop() {
        if (_lvPeer) { _lvPeer.destroy(); _lvPeer = null; }
        _lvConns = [];
        _lvSentCount = 0;
        $('#lv-viewer-count').text('0');
        $('#lv-sent-count').text('0');
        $('#lv-active-state').hide();
        $('#lv-idle-state').show();
        $('#lv-qr-container').empty();
    }

    function _lvSetStatus(msg, connected) {
        $('#lv-status-text').text(msg);
        $('#lv-status-dot').toggleClass('lv-dot-on', connected);
        $('#lv-viewer-count').text(_lvConns.length);
    }

    // Broadcast a JSON message to all connected viewers
    function _lvBroadcast(msgObj) {
        if (!_lvConns.length) return;
        // Add a unique ID so the viewer can deduplicate if the same message arrives twice
        msgObj._id = Math.random().toString(36).slice(2) + Date.now().toString(36);
        const json = JSON.stringify(msgObj);
        _lvConns.forEach(conn => {
            try { if (conn.open) conn.send(json); }
            catch (e) { console.warn('[LiveViewer] send error', e); }
        });
        _lvSentCount++;
        $('#lv-sent-count').text(_lvSentCount);
    }

    // Capture a video thumbnail (first frame) as a JPEG data URL.
    // Uses loadedmetadata → seek to avoid the onloadeddata race condition.
    function _lvVideoThumb(blobUrl, callback) {
        const vid = document.createElement('video');
        const canvas = document.createElement('canvas');
        let called = false;
        function done(dataUrl, dur) {
            if (called) return; called = true;
            vid.src = ''; callback(dataUrl, dur);
        }
        const guard = setTimeout(() => done(null, 0), 5000); // never hang
        vid.preload = 'metadata';
        vid.muted = true;
        vid.playsInline = true;
        vid.onloadedmetadata = function() {
            vid.currentTime = Math.min(0.5, (vid.duration || 1) * 0.1);
        };
        vid.onseeked = function() {
            clearTimeout(guard);
            const W = Math.min(vid.videoWidth  || 640, 640);
            const H = Math.min(vid.videoHeight || 360, 360);
            const scale = Math.min(W / (vid.videoWidth || 640), H / (vid.videoHeight || 360));
            canvas.width  = Math.round((vid.videoWidth  || 640) * scale);
            canvas.height = Math.round((vid.videoHeight || 360) * scale);
            canvas.getContext('2d').drawImage(vid, 0, 0, canvas.width, canvas.height);
            done(canvas.toDataURL('image/jpeg', 0.72), Math.round(vid.duration || 0));
        };
        vid.onerror = function() { clearTimeout(guard); done(null, 0); };
        vid.src = blobUrl;
    }

    // Call this whenever a new photo is captured and should be sent to viewers
    function lvBroadcastPhoto(dataUrl, filename) {
        if (!_lvConns.length) return;
        _lvBroadcast({ type: 'photo', data: dataUrl, filename: filename, ts: Date.now(), driveUrl: null });
    }

    // Call this whenever a new video is captured and should be sent to viewers
    function lvBroadcastVideo(blobUrl, filename) {
        if (!_lvConns.length) return;
        _lvVideoThumb(blobUrl, function(thumbDataUrl, duration) {
            // Even if thumbnail failed, still send the card with a null thumbnail
            _lvBroadcast({ type: 'video', data: thumbDataUrl, filename: filename, ts: Date.now(), duration: duration, driveUrl: null });
        });
    }

    // Called after a Drive upload completes to update the viewer card with a QR button
    function lvBroadcastDriveUpdate(filename, driveUrl) {
        if (!_lvConns.length || !driveUrl) return;
        _lvBroadcast({ type: 'drive-update', filename: filename, driveUrl: driveUrl });
    }

    // Host UI handlers
    $('#btn-lv-start').on('click', _lvStart);
    $('#btn-lv-stop').on('click', _lvStop);

    // Save the network address the admin types in
    $('#lv-network-addr').on('input', function() {
        appConfig.lvNetworkAddr = $(this).val().trim();
    });

    // ── Viewer mode ────────────────────────────────────────────
    (function initViewerMode() {
        const params = new URLSearchParams(window.location.search);
        const hostId = params.get('viewer');
        if (!hostId) return; // normal host mode — nothing to do

        // Hide everything except the viewer overlay
        $('body > *').not('#viewer-mode').css('visibility', 'hidden');
        $('#viewer-mode').css('display', 'flex');

        // ── Lightbox helpers ──
        function _viewerOpenPhoto(dataUrl) {
            $('#viewer-lb-img').attr('src', dataUrl).show();
            $('#viewer-lb-qr-wrap').hide();
            $('#viewer-lb-video-note').hide();
            $('#viewer-lightbox').css('display', 'flex');
        }
        function _viewerOpenVideoNoLink(thumbDataUrl) {
            // No Drive link: show thumbnail (or blank) with an explanatory note
            if (thumbDataUrl) $('#viewer-lb-img').attr('src', thumbDataUrl).show();
            else $('#viewer-lb-img').hide();
            $('#viewer-lb-qr-wrap').hide();
            $('#viewer-lb-video-note').show();
            $('#viewer-lightbox').css('display', 'flex');
        }
        function _viewerOpenQr(driveUrl) {
            $('#viewer-lb-img').hide().attr('src', '');
            $('#viewer-lb-qr').empty();
            new QRCode(document.getElementById('viewer-lb-qr'), {
                text: driveUrl, width: 220, height: 220,
                colorDark: '#1e293b', colorLight: '#fff',
                correctLevel: QRCode.CorrectLevel.M
            });
            $('#viewer-lb-drive-url').text(driveUrl);
            $('#viewer-lb-qr-wrap').show();
            $('#viewer-lb-video-note').hide();
            $('#viewer-lightbox').css('display', 'flex');
        }
        function _viewerCloseLb() {
            $('#viewer-lightbox').hide();
            $('#viewer-lb-img').attr('src', '');
            $('#viewer-lb-qr').empty();
            $('#viewer-lb-video-note').hide();
        }
        $('#viewer-lb-close').on('click', _viewerCloseLb);
        $('#viewer-lightbox').on('click', function(e) { if (e.target === this) _viewerCloseLb(); });

        // Map filename → $item for drive-update lookups
        const _viewerItems = {};
        // Deduplicate messages by their _id field
        const _viewerSeenIds = new Set();

        function _viewerUpdateDrive(filename, driveUrl) {
            const $item = _viewerItems[filename];
            if (!$item || !driveUrl) return;
            $item.attr('data-drive-url', driveUrl);
            const $footer = $item.find('.viewer-item-footer');
            if (!$footer.find('.viewer-qr-btn').length) {
                const $btn = $('<button class="viewer-qr-btn">&#x1F4F1; QR</button>');
                $btn.on('click', function(e) { e.stopPropagation(); _viewerOpenQr(driveUrl); });
                $footer.prepend($btn);
            }
        }

        let _viewerCount = 0;
        function _viewerAddItem(msg, type) {
            _viewerCount++;
            $('#viewer-empty').hide();
            const ts  = new Date(msg.ts).toLocaleTimeString();
            const dur = msg.duration ? ' (' + msg.duration + 's)' : '';
            const label = type === 'video' ? 'Video' + dur : 'Photo';
            const driveUrl = msg.driveUrl || null;

            let mediaHtml = '';
            if (type === 'photo') {
                mediaHtml = msg.data
                    ? `<img src="${msg.data}" alt="Photo" style="width:100%;height:100%;object-fit:cover;display:block;">`
                    : `<div style="width:100%;height:100%;background:#1e293b;display:flex;align-items:center;justify-content:center;"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></div>`;
            } else {
                mediaHtml = msg.data
                    ? `<img src="${msg.data}" alt="Video" style="width:100%;height:100%;object-fit:cover;display:block;opacity:0.9;">`
                    : `<div style="width:100%;height:100%;background:#1e293b;display:flex;align-items:center;justify-content:center;"><svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor" style="color:#475569;"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>`;
                // Play icon overlay on thumbnail
                if (msg.data) {
                    mediaHtml += `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;"><div style="width:46px;height:46px;background:rgba(0,0,0,0.6);border-radius:50%;display:flex;align-items:center;justify-content:center;"><svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21 5 3"/></svg></div></div>`;
                }
            }

            const qrBtnHtml = driveUrl ? '<button class="viewer-qr-btn">&#x1F4F1; QR</button>' : '';

            const $item = $(`
                <div class="viewer-item viewer-item-new" data-type="${type}" data-filename="${(msg.filename||'').replace(/"/g,'')}"
                     ${driveUrl ? 'data-drive-url="' + driveUrl + '"' : ''}>
                    <div class="viewer-item-media" style="position:relative;width:100%;padding-top:${type==='video'?'56.25%':'75%'};overflow:hidden;border-radius:8px 8px 0 0;cursor:pointer;">
                        <div style="position:absolute;inset:0;">${mediaHtml}</div>
                    </div>
                    <div class="viewer-item-footer" style="padding:0.4rem 0.6rem;display:flex;align-items:center;gap:0.4rem;">
                        ${qrBtnHtml}
                        <span style="font-size:0.78rem;font-weight:600;color:#f1f5f9;flex:1;">${label}</span>
                        <span style="font-size:0.72rem;color:#64748b;">${ts}</span>
                    </div>
                </div>
            `);

            // Tap media area:
            //   Photo  → open full image in lightbox
            //   Video + Drive link → open Drive URL in new tab so browser/Drive app plays it
            //   Video + no Drive   → show thumbnail in lightbox with explanatory note
            $item.find('.viewer-item-media').on('click', function() {
                const dUrl = $item.attr('data-drive-url') || null;
                if (type === 'photo') {
                    if (msg.data) _viewerOpenPhoto(msg.data);
                } else {
                    if (dUrl) window.open(dUrl, '_blank');
                    else      _viewerOpenVideoNoLink(msg.data);
                }
            });

            // QR button: always shows the Drive QR code overlay
            $item.find('.viewer-qr-btn').on('click', function(e) {
                e.stopPropagation();
                const dUrl = $item.attr('data-drive-url') || driveUrl;
                if (dUrl) _viewerOpenQr(dUrl);
            });

            if (msg.filename) _viewerItems[msg.filename] = $item;

            $('#viewer-gallery').prepend($item);
            setTimeout(() => $item.removeClass('viewer-item-new'), 600);
        }

        // ── Wake Lock: keep screen on while viewer is open ──────
        let _viewerWakeLock = null;
        async function _acquireWakeLock() {
            if (!('wakeLock' in navigator)) return;
            try {
                _viewerWakeLock = await navigator.wakeLock.request('screen');
                _viewerWakeLock.addEventListener('release', function() { _viewerWakeLock = null; });
            } catch (e) {
                console.warn('[Viewer] Wake Lock:', e.message);
            }
        }
        // Wake lock is released when the page is hidden; re-acquire on return
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible' && !_viewerWakeLock) _acquireWakeLock();
        });
        _acquireWakeLock();

        // ── Gallery persistence across page refreshes (sessionStorage) ──
        const _storeKey = 'lv_gallery_' + hostId;
        const STORE_MAX = 20;

        function _storedItems() {
            try { return JSON.parse(sessionStorage.getItem(_storeKey) || '[]'); }
            catch (e) { return []; }
        }
        function _saveItem(msg, type) {
            try {
                const items = _storedItems();
                items.unshift({ type: type, data: msg.data, filename: msg.filename, ts: msg.ts, duration: msg.duration, driveUrl: msg.driveUrl || null });
                if (items.length > STORE_MAX) items.length = STORE_MAX;
                sessionStorage.setItem(_storeKey, JSON.stringify(items));
            } catch (e) { /* quota exceeded — skip caching this item */ }
        }
        function _saveUpdateDrive(filename, driveUrl) {
            try {
                const items = _storedItems();
                const item = items.find(function(i) { return i.filename === filename; });
                if (item) { item.driveUrl = driveUrl; sessionStorage.setItem(_storeKey, JSON.stringify(items)); }
            } catch (e) {}
        }

        // Restore previously received captures after a page refresh
        (function _restoreGallery() {
            const saved = _storedItems();
            if (!saved.length) return;
            // saved is newest-first; reverse so repeated prepend keeps newest on top
            saved.slice().reverse().forEach(function(item) {
                _viewerAddItem(item, item.type);
            });
        })();

        // ── WebRTC connection with auto-reconnect ─────────────────
        let _viewerPeer = null;
        function connectToHost() {
            if (typeof Peer === 'undefined') { setTimeout(connectToHost, 200); return; }
            // Destroy any previous peer before creating a new one
            if (_viewerPeer) { try { _viewerPeer.destroy(); } catch (e) {} _viewerPeer = null; }
            const peer = new Peer();
            _viewerPeer = peer;
            peer.on('open', function() {
                const conn = peer.connect(hostId, { reliable: true });
                conn.on('open', function() {
                    $('#viewer-status-dot').css('background', '#22c55e');
                    $('#viewer-status-text').text('Live');
                    $('#viewer-event-name').text('Connected — waiting for captures…');
                });
                conn.on('data', function(raw) {
                    try {
                        const msg = JSON.parse(raw);
                        // Deduplicate: skip messages we've already processed
                        if (msg._id) {
                            if (_viewerSeenIds.has(msg._id)) return;
                            _viewerSeenIds.add(msg._id);
                        }
                        if      (msg.type === 'hello')        { if (msg.eventName) $('#viewer-event-name').text(msg.eventName); }
                        else if (msg.type === 'photo')        { _viewerAddItem(msg, 'photo');  _saveItem(msg, 'photo'); }
                        else if (msg.type === 'video')        { _viewerAddItem(msg, 'video');  _saveItem(msg, 'video'); }
                        else if (msg.type === 'drive-update') { _viewerUpdateDrive(msg.filename, msg.driveUrl); _saveUpdateDrive(msg.filename, msg.driveUrl); }
                    } catch (e) { /* ignore malformed */ }
                });
                conn.on('close', function() {
                    $('#viewer-status-dot').css('background', '#f59e0b');
                    $('#viewer-status-text').text('Reconnecting…');
                    setTimeout(connectToHost, 3000);
                });
                conn.on('error', function() {
                    $('#viewer-status-dot').css('background', '#f59e0b');
                    $('#viewer-status-text').text('Reconnecting…');
                    setTimeout(connectToHost, 3000);
                });
            });
            peer.on('error', function(err) {
                console.warn('[Viewer] Peer error:', err.type);
                $('#viewer-status-dot').css('background', '#f59e0b');
                $('#viewer-status-text').text('Reconnecting…');
                setTimeout(connectToHost, 4000);
            });
        }
        connectToHost();
    })();

});