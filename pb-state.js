// ─── Global runtime state ─────────────────────────────────────────────────────
let currentStream = null;
let directoryHandle = null;
let vgDirectoryHandle = null;

let capturedPhotos = [];           // In-memory database of captured session photos
let capturedPhotoDriveLinks = [];  // parallel: Drive share URL for each photo, or null
let capturedVideos = [];           // In-memory database of captured video guestbook blob URLs
let capturedVideoDriveLinks = [];  // parallel: Drive share URL for each video, or null

// ─── Application config ───────────────────────────────────────────────────────
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
    // Capture mode default is Video Guestbook.
    captureMode: 'videoguestbook',
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
    // Template image (set by admin in Photo Template panel)
    templateBg: null,
    // Video Guestbook frame/background image (overlaid on the recording)
    vgFrameBg: null,
    // Show social sharing overlay after each capture
    socialShare: true,
    // Event name used as filename prefix (e.g. "Smiths_Wedding")
    eventName: '',
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
    vgCustomPrompts: [],          // admin-added prompts: [{text: string, enabled: boolean}]
    vgDisabledTemplatePrompts: [], // template prompt strings the admin has disabled
    vgSplashDuration: 3,          // seconds to show the "Get Ready" splash screen

    // Thank You screen — Video Guestbook
    vgThankYouEnabled: false,
    vgThankYouImage: null,        // { objectUrl: string } or null — custom background image
    vgThankYouDuration: 5,        // seconds before auto-advancing to welcome screen

    // Capture Review — Video Guestbook
    vgCaptureReviewEnabled: true, // play back the recording for guest review after capture

    // Photo Booth offer — shown after VG recording completes
    vgOfferPb: false, // prompt guest to take a photo strip after their video message

    // Kiosk exit PIN — stored as SHA-256 hex hash, '' = no PIN required
    kioskPin: '',
    kioskPinLen: 0,  // original PIN length (needed to know when to auto-compare)

    // Live Gallery Viewer — operator's local network address (e.g. http://192.168.1.50)
    lvNetworkAddr: '',
};

// ── Persisted config keys (serializable, non-sensitive) ──────────────────────
// Media blobs (welcomeMedia, templateBg, vgOverlay, vgThankYouImage) and Drive
// tokens are intentionally excluded — they cannot be JSON-serialised or should
// not be stored across sessions.
const PERSISTED_KEYS = [
    'layout', 'saveLocal', 'saveDrive', 'countdownFirst', 'countdownOthers',
    'reviewTime', 'welcomeBg', 'welcomeTitle', 'welcomeSubtitle', 'photoMode',
    'captureMode', 'vgMaxDuration', 'vgPromptText', 'vgCountdown',
    'vgSelectedCameraId', 'vgFacingMode', 'vgSelectedMicId', 'vgSelectedSpeakerId',
    'vgSaveLocal', 'vgSaveDrive', 'socialShare', 'eventName',
    'selectedCameraId', 'facingMode',
    'disclaimerEnabled', 'disclaimerHeader', 'disclaimerOrg', 'disclaimerText',
    'driveFolderName', 'vgDriveFolderName', 'vgDriveClientId',
    'vgPromptsEnabled', 'vgPromptCategory', 'vgCustomPrompts', 'vgDisabledTemplatePrompts', 'vgSplashDuration',
    'vgThankYouEnabled', 'vgThankYouDuration', 'vgCaptureReviewEnabled', 'vgOfferPb',
    'kioskPin', 'kioskPinLen', 'lvNetworkAddr'
];

// Restore persisted config immediately — before DOM ready — so all subsequent
// init code reads the correct values from appConfig.
(function() {
    try {
        const saved = localStorage.getItem('photobooth_config');
        if (!saved) return;
        const parsed = JSON.parse(saved);
        PERSISTED_KEYS.forEach(function(k) {
            if (parsed[k] !== undefined) appConfig[k] = parsed[k];
        });
        // Capture Settings is VG-only now; normalize legacy saved values.
        appConfig.captureMode = 'videoguestbook';
        // Migrate legacy custom prompts (string[]) to object format
        appConfig.vgCustomPrompts = appConfig.vgCustomPrompts.map(function(p) {
            return (typeof p === 'string') ? { text: p, enabled: true } : p;
        });
    } catch (e) {
        console.warn('[Config] Could not restore saved settings:', e);
    }
})();

function saveConfig() {
    try {
        const data = {};
        PERSISTED_KEYS.forEach(function(k) { data[k] = appConfig[k]; });
        localStorage.setItem('photobooth_config', JSON.stringify(data));
    } catch (e) {
        console.warn('[Config] Could not save settings:', e);
    }
}

let _saveTimer = null;
function _scheduleSave() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(saveConfig, 800);
}