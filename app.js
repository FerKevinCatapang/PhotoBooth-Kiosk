let currentStream = null;
let directoryHandle = null;

let capturedPhotos = []; // In-memory database of captured session photos
let capturedVideos = []; // In-memory database of captured video guestbook blob URLs

let appConfig = {
    layout: '4x6-1',
    storage: 'local',
    countdownFirst: 5,
    countdownOthers: 5,
    reviewTime: 4,
    welcomeBg: '#E0F2FE',
    welcomeTitle: 'Welcome to the Party!',
    welcomeSubtitle: 'Tap the camera to begin',
    welcomeMedia: null,   // { type: 'image'|'video', objectUrl: string } or null
    photoMode: false,
    // Capture mode: 'photobooth' | 'videoguestbook'
    captureMode: 'photobooth',
    // Video Guestbook settings
    vgMaxDuration: 60,        // max recording seconds
    vgPromptText: 'Share a message for the happy couple!',
    vgCountdown: 3,           // countdown before recording starts
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
    // Google Drive (Method A - browser OAuth)
    driveUpload: false,
    driveFolderName: 'Photo Booth Captures',
    _driveAccessToken: null,
    _driveFolderId: null
};

// ─── REPLACE THIS WITH YOUR OWN GOOGLE OAUTH CLIENT ID ───────────────────────
// 1. Go to console.cloud.google.com → APIs & Services → Credentials
// 2. Create OAuth 2.0 Client ID → Web application
// 3. Add your site URL (or http://localhost) as an Authorized JS Origin
// 4. Paste the Client ID below — users can also override it in the Drive panel UI
const GOOGLE_DRIVE_CLIENT_ID = '1005976603326-rdevbnd8dgg3dd7844cgrkuv07hf1o05.apps.googleusercontent.com';
// ─────────────────────────────────────────────────────────────────────────────

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
    
    // --- Initialize Dashboard Gallery ---
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

    // --- Storage ---
    $('input[name="storage"]').on('change', function() {
        appConfig.storage = $(this).val();
        if(appConfig.storage === 'local') {
            $('#local-folder-config').slideDown();
        } else {
            $('#local-folder-config').slideUp();
        }
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

    $('#edit-subtitle').on('input', function() {
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

    $('#btn-pick-bg').on('click', () => $('#upload-template-bg').click());
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

    // Find or create the target folder; returns folderId
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
        // Create the folder
        const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder' })
        });
        const folder = await createResp.json();
        appConfig._driveFolderId = folder.id;
        return folder.id;
    }

    // Upload a Blob to Drive inside the configured folder
    async function uploadToDrive(blob, filename) {
        try {
            const token = await _driveEnsureToken();
            const folderId = await _driveEnsureFolder(token);
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

    // UI: toggle
    $('#toggle-drive-upload').on('change', function() {
        appConfig.driveUpload = this.checked;
        $('#toggle-drive-label').text(this.checked ? 'ON' : 'OFF');
        $(this.closest('label')).toggleClass('is-on', this.checked);
    });

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

    // --- Camera selection ---
    async function populateCameraList() {
        try {
            // A brief getUserMedia is needed first so labels are not empty (browser security)
            await navigator.mediaDevices.getUserMedia({ video: true })
                .then(s => s.getTracks().forEach(t => t.stop()))
                .catch(() => {});

            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoInputs = devices.filter(d => d.kind === 'videoinput');
            const sel = document.getElementById('camera-select');
            const prevValue = appConfig.selectedCameraId || sel.value;

            sel.innerHTML = '';
            if (videoInputs.length === 0) {
                sel.innerHTML = '<option value="">No cameras found</option>';
                return;
            }
            videoInputs.forEach((cam, i) => {
                const opt = document.createElement('option');
                opt.value = cam.deviceId;
                opt.textContent = cam.label || ('Camera ' + (i + 1));
                // Auto-prefer USB/external cameras
                if (!appConfig.selectedCameraId &&
                    (cam.label.toLowerCase().includes('usb') || cam.label.toLowerCase().includes('external'))) {
                    opt.selected = true;
                }
                sel.appendChild(opt);
            });
            // Restore previously chosen camera if still available
            if (prevValue && [...sel.options].some(o => o.value === prevValue)) {
                sel.value = prevValue;
            }
            appConfig.selectedCameraId = sel.value;
        } catch (e) {
            console.warn('populateCameraList:', e);
        }
    }

    $('#camera-select').on('change', function() {
        appConfig.selectedCameraId = this.value;
    });

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

    // --- Video Guestbook Frame/Background ---
    async function applyVgFrameImage(file) {
        try {
            const img = await loadImageFromFile(file);
            appConfig.vgFrameBg = img;
            $('#vg-frame-thumb').attr('src', img.src);
            $('#vg-frame-filename').text(file.name);
            $('#vg-frame-dims').text(img.naturalWidth + ' × ' + img.naturalHeight + ' px');
            $('#vg-frame-empty-state').hide();
            $('#vg-frame-preview-state').show();
            // Show the overlay on the live viewfinder
            $('#vg-frame-overlay').attr('src', img.src).show();
        } catch(e) { console.error('Failed to load VG frame image', e); }
    }

    $('#btn-pick-vg-frame').on('click', () => $('#upload-vg-frame').click());
    $('#vg-frame-empty-state').on('click', function(e) {
        if (!$(e.target).is('button')) $('#upload-vg-frame').click();
    });
    $('#upload-vg-frame').on('change', async function() {
        if (this.files[0]) await applyVgFrameImage(this.files[0]);
        this.value = '';
    });
    $('#btn-clear-vg-frame').on('click', function() {
        appConfig.vgFrameBg = null;
        $('#vg-frame-preview-state').hide();
        $('#vg-frame-empty-state').show();
        $('#vg-frame-overlay').hide().attr('src', '');
    });

    // Drag-and-drop on VG frame upload zone
    const vgFrameZone = document.getElementById('vg-frame-upload-zone');
    if (vgFrameZone) {
        vgFrameZone.addEventListener('dragover', e => { e.preventDefault(); vgFrameZone.classList.add('drag-over'); });
        vgFrameZone.addEventListener('dragleave', () => vgFrameZone.classList.remove('drag-over'));
        vgFrameZone.addEventListener('drop', async e => {
            e.preventDefault();
            vgFrameZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (!file || !file.type.match(/image\/(jpe?g|png)/)) return;
            await applyVgFrameImage(file);
        });
    }

    $('input[name="facing-mode"]').on('change', function() {
        appConfig.facingMode = this.value;
    });

    $('#btn-refresh-cameras').on('click', function() {
        const btn = $(this);
        btn.prop('disabled', true).text('Refreshing…');
        populateCameraList().finally(() => btn.prop('disabled', false).text('↺ Refresh'));
    });

    // Populate on load (non-blocking)
    populateCameraList();

    // --- Launch Kiosk ---
    $('#btn-launch-booth').on('click', async function() {
        appConfig.layout = $('input[name="layout"]:checked').val();
        const launchBtn = $(this);
        launchBtn.prop('disabled', true).text('Initializing Hardware...');

        try {
            // Build video constraints: specific device takes priority, then facingMode
            const videoConstraints = {
                width:  { ideal: 4096 },
                height: { ideal: 3072 }
            };
            if (appConfig.selectedCameraId && appConfig.facingMode === '') {
                videoConstraints.deviceId = { exact: appConfig.selectedCameraId };
            } else if (appConfig.facingMode) {
                videoConstraints.facingMode = { ideal: appConfig.facingMode };
            }
            const constraints = appConfig.captureMode === 'videoguestbook'
                ? { video: videoConstraints, audio: true }
                : { video: videoConstraints };

            currentStream = await navigator.mediaDevices.getUserMedia(constraints);

            if (appConfig.captureMode === 'videoguestbook') {
                $('#vg-camera-feed')[0].srcObject = currentStream;
            } else {
                $('#camera-feed')[0].srcObject = currentStream;
                applyKioskViewfinderSize();
            }

            $('#admin-dashboard').hide();
            $('#kiosk-mode').fadeIn(400);
            resetToWelcomeScreen();
            
        } catch (err) {
            console.error("Camera error:", err);
            alert("Camera access denied. Cannot start kiosk mode.");
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
    $('#btn-start-session').on('click', function() {
        $('#guest-welcome').addClass('hidden');
        setTimeout(triggerCaptureSequence, 500);
    });

    // --- Kiosk Logic (Video Guestbook) ---
    $('#btn-start-vg-session').on('click', function() {
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
        $('#camera-feed').show();
        $('#processing-overlay').hide();
        $('#live-booth').hide();
        $('#vg-booth').hide();

        // Show the correct start button for the active mode
        const isVg = appConfig.captureMode === 'videoguestbook';
        $('#btn-start-session').toggle(!isVg);
        $('#btn-start-vg-session').toggle(isVg);

        $('#guest-welcome').removeClass('hidden');
        // Resume welcome video if it was paused
        const kv = $('#ws-video-bg')[0];
        if (kv && appConfig.welcomeMedia && appConfig.welcomeMedia.type === 'video' && kv.paused) {
            kv.play();
        }
    }

    // ==================== SOCIAL SHARING ====================
    let _shareObjectUrl = null;
    let _shareCountdownTimer = null;

    function showShareOverlay(canvas, dataUrl) {
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

        const fW = video.videoWidth;
        const fH = video.videoHeight;

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

    function stopVgRecordingIfActive() {
        if (_vgMediaRecorder && _vgMediaRecorder.state !== 'inactive') {
            _vgMediaRecorder.stop();
        }
        clearInterval(_vgTimerInterval);
        clearTimeout(_vgMaxTimer);
        if (_vgFrameAnimId) { cancelAnimationFrame(_vgFrameAnimId); _vgFrameAnimId = null; }
    }

    async function triggerVgSequence() {
        $('#vg-booth').show();
        const videoEl = $('#vg-camera-feed')[0];

        // Pre-record countdown
        const cdEl = document.getElementById('vg-countdown-overlay');
        cdEl.style.display = 'flex';
        for (let i = appConfig.vgCountdown; i >= 1; i--) {
            cdEl.textContent = i;
            cdEl.classList.remove('cd-pop');
            void cdEl.offsetWidth; // reflow to restart animation
            cdEl.classList.add('cd-pop');
            await new Promise(r => setTimeout(r, 1000));
        }
        cdEl.style.display = 'none';

        // Start recording
        _vgChunks = [];
        _vgElapsed = 0;
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
            ? 'video/webm;codecs=vp9,opus'
            : MediaRecorder.isTypeSupported('video/webm')
            ? 'video/webm'
            : 'video/mp4';

        // When a frame/background is set, composite it onto a canvas and record that stream
        // so the frame is embedded in the saved video file.
        let recordStream = currentStream;
        let stopCompositing = false;
        if (appConfig.vgFrameBg) {
            const vtrack = currentStream.getVideoTracks()[0];
            const settings = vtrack ? vtrack.getSettings() : {};
            const cw = settings.width  || videoEl.videoWidth  || 1280;
            const ch = settings.height || videoEl.videoHeight || 720;
            const compositeCanvas = document.createElement('canvas');
            compositeCanvas.width  = cw;
            compositeCanvas.height = ch;
            const compCtx = compositeCanvas.getContext('2d');
            const frameBg = appConfig.vgFrameBg;

            function drawCompositeFrame() {
                if (stopCompositing) return;
                compCtx.drawImage(videoEl, 0, 0, cw, ch);
                compCtx.drawImage(frameBg, 0, 0, cw, ch);
                _vgFrameAnimId = requestAnimationFrame(drawCompositeFrame);
            }
            drawCompositeFrame();

            // Combine canvas video stream with the original audio track
            const canvasStream = compositeCanvas.captureStream(30);
            const audioTracks = currentStream.getAudioTracks();
            audioTracks.forEach(t => canvasStream.addTrack(t));
            recordStream = canvasStream;
        }

        try {
            _vgMediaRecorder = new MediaRecorder(recordStream, { mimeType });
        } catch (e) {
            _vgMediaRecorder = new MediaRecorder(recordStream);
        }

        _vgMediaRecorder.ondataavailable = function(e) {
            if (e.data && e.data.size > 0) _vgChunks.push(e.data);
        };

        _vgMediaRecorder.onstop = function() {
            clearInterval(_vgTimerInterval);
            clearTimeout(_vgMaxTimer);
            stopCompositing = true;
            if (_vgFrameAnimId) { cancelAnimationFrame(_vgFrameAnimId); _vgFrameAnimId = null; }
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

        // Update HUD timer every second
        _vgTimerInterval = setInterval(function() {
            _vgElapsed++;
            const mins = Math.floor(_vgElapsed / 60);
            const secs = _vgElapsed % 60;
            $('#vg-timer').text(mins + ':' + String(secs).padStart(2, '0'));
            const left = appConfig.vgMaxDuration - _vgElapsed;
            if (left <= 10) {
                $('#vg-time-left').text(left + 's left').show();
            }
        }, 1000);

        // Auto-stop at max duration
        _vgMaxTimer = setTimeout(function() {
            if (_vgMediaRecorder && _vgMediaRecorder.state !== 'inactive') {
                _vgMediaRecorder.stop();
            }
        }, appConfig.vgMaxDuration * 1000);
    }

    $('#btn-vg-stop').on('click', function() {
        stopVgRecordingIfActive();
    });

    async function saveVgVideo(blob, ext) {
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
        updateDashboardGallery();

        try {
            if (directoryHandle) {
                const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
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

        // Reset HUD state
        $('#vg-time-left').hide().text('');
        $('#vg-timer').text('0:00');
        $('#vg-processing-overlay').fadeOut(200);

        // Brief thank-you pause then return to welcome
        await new Promise(r => setTimeout(r, 1500));
        $('#vg-booth').hide();
        resetToWelcomeScreen();
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
        const fW = src.width  || src.videoWidth;
        const fH = src.height || src.videoHeight;

        const scale = Math.max(slotW / fW, slotH / fH);
        const srcW  = Math.round(slotW / scale);
        const srcH  = Math.round(slotH / scale);
        const srcX  = Math.max(0, Math.round((fW - srcW) / 2));
        const srcY  = Math.max(0, Math.round((fH - srcH) / 2));

        ctx.save();
        // Mirror horizontally — video feed is shown mirrored (selfie UX);
        // the saved photo is also mirrored so text / pose reads naturally in prints.
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

        if (appConfig.storage === 'local') {
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
        } else {
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1.0));
            await new Promise(r => setTimeout(r, 800));
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
        updateDashboardGallery();

        // AUTO-UPLOAD TO GOOGLE DRIVE (Method A) — fire-and-forget, non-blocking
        if (appConfig.driveUpload && _getDriveClientId() && !_getDriveClientId().startsWith('YOUR_CLIENT')) {
            canvas.toBlob(async function(blob) {
                try {
                    await uploadToDrive(blob, filename);
                    console.log('[Drive] Uploaded:', filename);
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

    function runCountdown(seconds) {
        return new Promise(resolve => {
            let count = seconds;
            const overlay = $('#countdown-overlay');
            // Reset state before starting so previous transition doesn't linger
            overlay.removeClass('active').hide();
            void overlay[0].offsetWidth;
            overlay.text(count).show();
            requestAnimationFrame(() => overlay.addClass('active'));
            
            const interval = setInterval(() => {
                count--;
                if (count > 0) {
                    overlay.removeClass('active');
                    void overlay[0].offsetWidth; 
                    overlay.text(count).addClass('active');
                } else {
                    clearInterval(interval);
                    overlay.removeClass('active');
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
                photoGrid.append(`<div class="gallery-item" data-index="${index}" title="Photo #${num}"><img src="${src}" alt="Photo #${num}"><div class="overlay">Photo #${num}</div></div>`);
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
                videoGrid.append(`
                    <div class="gallery-item gallery-item-video" data-vindex="${index}" title="Video #${num}">
                        <video src="${src}" preload="metadata" muted playsinline></video>
                        <div class="gallery-play-icon">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        </div>
                        <div class="overlay">Video #${num}</div>
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
    $('#event-name-input, #wiz-event-name').on('input', function() {
        appConfig.eventName = this.value.trim();
        $('#event-name-input, #wiz-event-name').val(appConfig.eventName);
        _updateFilenamePreview();
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
        appConfig.storage = val;
        $(`input[name="storage"][value="${val}"]`).prop('checked', true);
        const showFolder = val === 'local';
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

});
