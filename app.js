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
    });

    $('#chk-save-drive').on('change', function() {
        appConfig.saveDrive = this.checked;
        _updateEventNameWarnings();
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

    $('#edit-vg-panel-title').on('input', function() {
        appConfig.vgPanelTitle = $(this).val();
        if (appConfig.captureMode === 'videoguestbook') {
            $('#live-ws-title-vg').text(appConfig.vgPanelTitle || 'Raise a Toast!');
        }
    });

    $('#edit-vg-couple-name').on('input', function() {
        const name = $(this).val();
        appConfig.vgCoupleName = name;
        $('#vg-couple-name-preview').text(name || 'Alice & Dan');
        if (appConfig.captureMode === 'videoguestbook') {
            $('#live-ws-subtitle-vg').text(_getVgPanelSubtitle());
        }
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
        function _enabledCount() {
            const builtIn  = PROMPT_TEMPLATES[appConfig.vgPromptCategory] || [];
            const disabled = appConfig.vgDisabledTemplatePrompts;
            const tplEnabled = builtIn.filter(function(q) { return disabled.indexOf(q) === -1; }).length;
            const cusEnabled = appConfig.vgCustomPrompts.filter(function(p) { return p.enabled; }).length;
            return tplEnabled + cusEnabled;
        }

        function _toggle(checked) {
            return '<label class="vg-prompt-toggle-wrap">' +
                '<input type="checkbox" class="vg-prompt-toggle"' + (checked ? ' checked' : '') + '>' +
                '<span class="vg-prompt-toggle-pill"></span>' +
                '</label>';
        }

        function _renderPromptList() {
            const builtIn  = PROMPT_TEMPLATES[appConfig.vgPromptCategory] || [];
            const custom   = appConfig.vgCustomPrompts;
            const disabled = appConfig.vgDisabledTemplatePrompts;

            $('#vg-prompts-count').text('(' + _enabledCount() + ' enabled)');

            const $list = $('#vg-prompts-list').empty();
            builtIn.forEach(function(q) {
                const isEnabled = disabled.indexOf(q) === -1;
                $list.append(
                    '<li class="vg-prompt-item' + (isEnabled ? '' : ' is-disabled') + '" data-type="template" data-key="' + encodeURIComponent(q) + '">' +
                    _toggle(isEnabled) +
                    '<span class="vg-prompt-badge">Template</span>' +
                    '<span class="vg-prompt-text">' + $('<span>').text(q).html() + '</span>' +
                    '</li>'
                );
            });
            custom.forEach(function(p, i) {
                $list.append(
                    '<li class="vg-prompt-item' + (p.enabled ? '' : ' is-disabled') + '" data-type="custom" data-idx="' + i + '">' +
                    _toggle(p.enabled) +
                    '<span class="vg-prompt-badge vg-prompt-badge-custom">Custom</span>' +
                    '<span class="vg-prompt-text">' + $('<span>').text(p.text).html() + '</span>' +
                    '<button class="vg-prompt-del" data-idx="' + i + '" title="Remove">\u2715</button>' +
                    '</li>'
                );
            });

            $list.find('.vg-prompt-toggle').on('change', function() {
                const $li = $(this).closest('.vg-prompt-item');
                const on  = this.checked;
                $li.toggleClass('is-disabled', !on);
                if ($li.data('type') === 'template') {
                    const q   = decodeURIComponent($li.data('key'));
                    const idx = appConfig.vgDisabledTemplatePrompts.indexOf(q);
                    if (on  && idx !== -1) appConfig.vgDisabledTemplatePrompts.splice(idx, 1);
                    if (!on && idx === -1) appConfig.vgDisabledTemplatePrompts.push(q);
                } else {
                    appConfig.vgCustomPrompts[parseInt($li.data('idx'), 10)].enabled = on;
                }
                $('#vg-prompts-count').text('(' + _enabledCount() + ' enabled)');
                _scheduleSave();
            });

            $list.find('.vg-prompt-del').on('click', function() {
                appConfig.vgCustomPrompts.splice(parseInt($(this).data('idx'), 10), 1);
                _renderPromptList();
                _scheduleSave();
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

        // Splash screen duration slider
        $('#setting-vg-splash-duration').val(appConfig.vgSplashDuration).on('input', function() {
            appConfig.vgSplashDuration = parseInt(this.value, 10);
            $('#val-vg-splash-duration').text(this.value);
            _scheduleSave();
        });
        $('#val-vg-splash-duration').text(appConfig.vgSplashDuration);

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
            _scheduleSave();
        });

        function _addCustomPrompt() {
            const val = $('#vg-custom-prompt-input').val().trim();
            if (!val) return;
            appConfig.vgCustomPrompts.push({ text: val, enabled: true });
            $('#vg-custom-prompt-input').val('');
            _renderPromptList();
            _scheduleSave();
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
            // Keep this panel accessible regardless of current capture mode.
            $('#nav-vg-thankyou').show();
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
            if ($(e.target).closest('#ty-media-remove, #ty-media-filled, #btn-pick-ty-media').length) return;
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

    })();

    // --- Capture Review toggle — Video Guestbook ---
    (function initVgCaptureReview() {
        function _syncToggle() {
            const on = appConfig.vgCaptureReviewEnabled;
            $('#toggle-vg-capture-review').prop('checked', on).closest('.toggle-switch').toggleClass('is-on', on);
            $('#toggle-vg-capture-review-label').text(on ? 'ON' : 'OFF');
        }
        _syncToggle();
        $('#toggle-vg-capture-review').on('change', function() {
            appConfig.vgCaptureReviewEnabled = this.checked;
            $('#toggle-vg-capture-review-label').text(this.checked ? 'ON' : 'OFF');
            $(this).closest('.toggle-switch').toggleClass('is-on', this.checked);
        });
    })();

    // --- Photo Booth offer toggle — Video Guestbook ---
    (function initVgOfferPb() {
        function _syncToggle() {
            const on = appConfig.vgOfferPb;
            $('#toggle-vg-offer-pb').prop('checked', on).closest('.toggle-switch').toggleClass('is-on', on);
            $('#toggle-vg-offer-pb-label').text(on ? 'ON' : 'OFF');
            $('#photo-offer-config').toggle(on);
        }
        _syncToggle();
        $('#toggle-vg-offer-pb').on('change', function() {
            appConfig.vgOfferPb = this.checked;
            $('#toggle-vg-offer-pb-label').text(this.checked ? 'ON' : 'OFF');
            $(this).closest('.toggle-switch').toggleClass('is-on', this.checked);
            $('#photo-offer-config').toggle(this.checked);
            _scheduleSave();
        });
    })();

    // --- Photo Booth Splash Screen toggle + duration slider ---
    (function initPbSplash() {
        function _syncToggle() {
            const on = appConfig.pbSplashEnabled;
            $('#toggle-pb-splash').prop('checked', on).closest('.toggle-switch').toggleClass('is-on', on);
            $('#toggle-pb-splash-label').text(on ? 'ON' : 'OFF');
            $('#pb-splash-config').toggle(on);
        }
        _syncToggle();
        $('#toggle-pb-splash').on('change', function() {
            appConfig.pbSplashEnabled = this.checked;
            $('#toggle-pb-splash-label').text(this.checked ? 'ON' : 'OFF');
            $(this).closest('.toggle-switch').toggleClass('is-on', this.checked);
            $('#pb-splash-config').toggle(this.checked);
            _scheduleSave();
        });
        $('#setting-pb-splash-duration').val(appConfig.pbSplashDuration).on('input', function() {
            appConfig.pbSplashDuration = parseInt(this.value, 10);
            $('#val-pb-splash-duration').text(this.value);
            _scheduleSave();
        });
        $('#val-pb-splash-duration').text(appConfig.pbSplashDuration);
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

    // Keep template preview synced when layout changes
    $('input[name="layout"]').on('change', function() {
        updateTemplateSizeHint();
    });
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

    $('#bg-empty-state').on('click', function(e) {
        if (!$(e.target).closest('button, label').length) $('#upload-template-bg').click();
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
        el.innerHTML = msg;
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

    // Delegate to VG auth — single shared token for both PB and VG
    async function _driveEnsureToken() {
        return _vgDriveEnsureToken();
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

    // Create a session-specific sub-folder inside the event folder; returns folder object with id and webViewLink
    async function _driveEnsureSessionFolder(token) {
        // If session folder already created for this session, return cached values
        if (currentSessionFolderId && currentSessionFolderLink) {
            return { id: currentSessionFolderId, webViewLink: currentSessionFolderLink };
        }

        // Ensure we have a session ID
        if (!currentSessionId) {
            startNewSession();
        }

        const eventFolderId = await _driveEnsureEventFolder(token);
        const sessionFolderName = currentSessionId;

        // Create the session folder (don't search, always create new)
        const createResp = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,webViewLink', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: sessionFolderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [eventFolderId]
            })
        });
        const sessionFolder = await createResp.json();

        // Set public permissions on the session folder
        await _driveSetPublic(token, sessionFolder.id);

        // Cache the session folder ID and link
        currentSessionFolderId = sessionFolder.id;
        currentSessionFolderLink = sessionFolder.webViewLink;

        console.log('[Drive] Created session folder:', sessionFolderName, sessionFolder.webViewLink);
        return sessionFolder;
    }

    // Upload a Blob to Drive inside the session sub-folder
    async function uploadToDrive(blob, filename) {
        try {
            const token = await _driveEnsureToken();
            const sessionFolder = await _driveEnsureSessionFolder(token);
            const meta = JSON.stringify({ name: filename, parents: [sessionFolder.id] });
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
                // Token may have expired — clear shared VG token and retry once
                if (resp.status === 401) {
                    appConfig._vgDriveAccessToken = null;
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

    // Upload a video blob using the VG-specific Drive credentials into the session sub-folder
    async function uploadVgToDrive(blob, filename) {
        try {
            const token = await _vgDriveEnsureToken();
            const sessionFolder = await _vgDriveEnsureSessionFolder(token);
            const mimeType = blob.type || 'video/webm';
            const meta = JSON.stringify({ name: filename, parents: [sessionFolder.id] });
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

    // PB Drive auth is shared with VG — sign-in handled in Capture Settings

    // ─── VIDEO GUESTBOOK — INDEPENDENT GOOGLE DRIVE AUTH ──────────────────────

    function _getVgDriveClientId() {
        const el = document.getElementById('vg-drive-client-id');
        const inputVal = el ? el.value.trim() : '';
        // Fall back to VG config, then PB config, then the hardcoded constant
        return inputVal || appConfig.vgDriveClientId || _getDriveClientId();
    }

    function _vgDriveSetStatus(msg, isErr = false) {
        const el = document.getElementById('vg-drive-auth-status');
        if (el) { el.innerHTML = msg; el.style.color = isErr ? '#dc2626' : '#6b7280'; }
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

    // Create a session-specific sub-folder for VG inside the event folder; returns folder object with id and webViewLink
    async function _vgDriveEnsureSessionFolder(token) {
        // If session folder already created for this session, return cached values
        if (currentSessionFolderId && currentSessionFolderLink) {
            return { id: currentSessionFolderId, webViewLink: currentSessionFolderLink };
        }

        // Ensure we have a session ID
        if (!currentSessionId) {
            startNewSession();
        }

        const eventFolderId = await _vgDriveEnsureEventFolder(token);
        const sessionFolderName = currentSessionId;

        // Create the session folder (don't search, always create new)
        const createResp = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,webViewLink', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: sessionFolderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [eventFolderId]
            })
        });
        const sessionFolder = await createResp.json();

        // Set public permissions on the session folder
        await _driveSetPublic(token, sessionFolder.id);

        // Cache the session folder ID and link
        currentSessionFolderId = sessionFolder.id;
        currentSessionFolderLink = sessionFolder.webViewLink;

        console.log('[Drive VG] Created session folder:', sessionFolderName, sessionFolder.webViewLink);
        return sessionFolder;
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
            _vgDriveSetStatus('<i class="fa-solid fa-check"></i> Connected — videos will upload automatically', false);
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
        const sel = document.getElementById('camera-select');
        if (!sel) return;
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
                setDiag(`<span style="color:#dc2626;"><i class="fa-solid fa-triangle-exclamation"></i> Camera permission denied (${err.name}). Grant camera access in browser settings, then tap Refresh.</span>`);
                document.getElementById('camera-select').innerHTML = '<option value="">— permission denied —</option>';
                return;
            }

            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoInputs = devices.filter(d => d.kind === 'videoinput');
            const prevValue = appConfig.selectedCameraId || sel.value;

            sel.innerHTML = '';
            if (videoInputs.length === 0) {
                sel.innerHTML = '<option value="">No cameras found</option>';
                setDiag('<span style="color:#dc2626;"><i class="fa-solid fa-triangle-exclamation"></i> No cameras detected. Plug in the camera, make sure it is in UVC mode, then tap Refresh.</span>');
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
                ? '<span style="color:#f59e0b; display:block; margin-top:3px;"><i class="fa-solid fa-triangle-exclamation"></i> Some cameras have no label — grant camera permission and tap Refresh.</span>'
                : '';
            setDiag(`<span style="font-weight:600;">${videoInputs.length} camera(s) detected:</span><span style="display:block; margin-top:2px;">${lines}</span>${hint}`);

        } catch (e) {
            setDiag(`<span style="color:#dc2626;"><i class="fa-solid fa-triangle-exclamation"></i> Error: ${e.name} — ${e.message}</span>`);
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
        $('#btn-test-camera').html('<i class="fa-solid fa-play"></i> Test');
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
            btn.prop('disabled', false).html('<i class="fa-solid fa-stop"></i> Stop Test');
        } catch (e) {
            btn.prop('disabled', false).html('<i class="fa-solid fa-play"></i> Test');
            const msg = `<span style="color:#dc2626;"><i class="fa-solid fa-triangle-exclamation"></i> Could not open camera: <strong>${e.name}</strong> — ${e.message}</span>`;
            if (diag) diag.innerHTML = msg;
        }
    });

    $('#btn-stop-camera-test').on('click', function() { _stopCameraTest(); });

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
                setDiag(`<span style="color:#dc2626;"><i class="fa-solid fa-triangle-exclamation"></i> Camera permission denied (${err.name}). Grant camera access in browser settings, then tap Refresh.</span>`);
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
                setDiag('<span style="color:#dc2626;"><i class="fa-solid fa-triangle-exclamation"></i> No cameras detected. Plug in the camera, make sure it is in UVC mode, then tap Refresh.</span>');
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
                ? '<span style="color:#f59e0b; display:block; margin-top:3px;"><i class="fa-solid fa-triangle-exclamation"></i> Some cameras have no label — grant camera permission and tap Refresh.</span>'
                : '';
            setDiag(`<span style="font-weight:600;">${videoInputs.length} camera(s) detected:</span><span style="display:block; margin-top:2px;">${lines}</span>${hint}`);
        } catch (e) {
            setDiag(`<span style="color:#dc2626;"><i class="fa-solid fa-triangle-exclamation"></i> Error: ${e.name} — ${e.message}</span>`);
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
        $('#btn-test-vg-camera').html('<i class="fa-solid fa-play"></i> Test');
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
            btn.prop('disabled', false).html('<i class="fa-solid fa-stop"></i> Stop Test');
        } catch (e) {
            btn.prop('disabled', false).html('<i class="fa-solid fa-play"></i> Test');
            const msg = `<span style="color:#dc2626;"><i class="fa-solid fa-triangle-exclamation"></i> Could not open camera: <strong>${e.name}</strong> — ${e.message}</span>`;
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
                setDiag(`<span style="color:#dc2626;"><i class="fa-solid fa-triangle-exclamation"></i> Microphone permission denied (${e.name}). Grant microphone access in browser settings, then tap ↺ Refresh.</span>`);
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

            // Show "Grant Bluetooth Access" button when Chrome hides output labels (requires selectAudioOutput())
            const hasBlankOutputLabel = audioOutputs.some(d => !d.label);
            const grantBtn = document.getElementById('btn-grant-audio-output');
            if (grantBtn) {
                grantBtn.style.display =
                    (hasBlankOutputLabel && typeof navigator.mediaDevices.selectAudioOutput === 'function')
                    ? '' : 'none';
            }

            // Diagnostic summary
            const inputLines  = audioInputs.map((d, i) => `<span style="display:block;">[${i + 1}] ${d.label || '<em style="color:#f59e0b;">no label</em>'}</span>`).join('');
            const outputLines = audioOutputs.map((d, i) => `<span style="display:block;">[${i + 1}] ${d.label || '<em style="color:#f59e0b;">no label</em>'}</span>`).join('');
            const noOutputHint = audioOutputs.length === 0
                ? '<span style="color:#f59e0b; display:block; margin-top:3px;"><i class="fa-solid fa-triangle-exclamation"></i> No audio output devices found — speaker selection not available on this browser/device.</span>'
                : '';
            setDiag(
                `<span style="font-weight:600;">${audioInputs.length} mic(s) · ${audioOutputs.length} output(s) detected:</span>` +
                (inputLines  ? `<span style="display:block; margin-top:2px;">${inputLines}</span>`  : '') +
                (outputLines ? `<span style="display:block; margin-top:2px;">${outputLines}</span>` : '') +
                noOutputHint
            );
        } catch (e) {
            setDiag(`<span style="color:#dc2626;"><i class="fa-solid fa-triangle-exclamation"></i> Error: ${e.name} — ${e.message}</span>`);
            console.warn('populateVgAudioDeviceList:', e);
        }
    }

    $('#vg-mic-select').on('change', function() {
        appConfig.vgSelectedMicId = this.value;
        _scheduleSave();
    });

    $('#vg-speaker-select').on('change', function() {
        appConfig.vgSelectedSpeakerId = this.value;
        _scheduleSave();
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
                alert("Your browser does not support seamless folder saving. Files will be saved via standard downloads.");
                return;
            }
            directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            $('#vg-dir-status').text(`Saving to: /${directoryHandle.name}`);
        } catch (err) {
            console.log("Directory picker cancelled or failed.", err);
        }
    });

    // Populate VG camera and audio device lists on load
    populateVgCameraList();
    populateVgAudioDeviceList();

    // --- Advanced nav visibility ---
    function updateAdvancedNavForMode(mode) {
        $('#nav-photo-layout, #nav-template, #nav-video-overlay, #nav-stitch, #nav-vg-thankyou, #nav-vg-prompts').show();
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

            // Save to shared folder or trigger download
            try {
                if (directoryHandle) {
                    const fh = await directoryHandle.getFileHandle(filename, { create: true });
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
                // 1920×1080 for the live preview stream; ImageCapture.takePhoto() still uses the
                // camera's full sensor resolution for actual captures, so capture quality is unaffected.
                : { width: { ideal: 1920 }, height: { ideal: 1080 } };
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
            if (isVgMode) {
                // Two separate getUserMedia calls: Android Chrome ignores audio.deviceId
                // when paired with a video.deviceId in a single call (the camera's built-in
                // audio wins). Splitting them forces the browser to honour the mic selection.
                const videoStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
                let audioTracks = [];
                try {
                    const audioConstraint = appConfig.vgSelectedMicId
                        ? { deviceId: { exact: appConfig.vgSelectedMicId } }
                        : true;
                    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint });
                    audioTracks = audioStream.getAudioTracks();
                } catch (audioErr) {
                    console.warn('[VG] Requested mic unavailable, trying default:', audioErr.message);
                    try {
                        const fallback = await navigator.mediaDevices.getUserMedia({ audio: true });
                        audioTracks = fallback.getAudioTracks();
                    } catch (e2) {
                        console.warn('[VG] No audio track available:', e2.message);
                    }
                }
                currentStream = new MediaStream([
                    ...videoStream.getVideoTracks(),
                    ...audioTracks
                ]);
            } else {
                currentStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
            }

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

            // VG: stop the mic audio tracks immediately after kiosk launch.
            // While getUserMedia({audio}) is live, Android holds MODE_IN_COMMUNICATION which
            // routes audio output away from Bluetooth A2DP (JBL etc.) to the internal speaker.
            // Stopping the tracks here releases that lock so countdown beeps and review playback
            // reach the BT speaker. The mic is re-acquired fresh just before each recording.
            if (appConfig.captureMode === 'videoguestbook' && currentStream) {
                currentStream.getAudioTracks().forEach(t => { try { t.stop(); } catch (e) {} });
            }

            $('#admin-dashboard').hide();
            $('#kiosk-mode').fadeIn(400);
            _requestFullscreen();
            _setupSinkBeep(appConfig.vgSelectedSpeakerId);
            resetToWelcomeScreen();
            
        } catch (err) {
            console.error("Camera error:", err);
            let hint = '';
            if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                hint = 'The selected camera was not found. Unplug and replug the USB cable, confirm UVC mode is active on the camera, then tap Refresh in Camera Settings.';
            } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                hint = 'Camera permission was denied. Go to Settings → Apps → Chrome → Permissions → Camera → Allow, then try again.';
            } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                hint = 'The camera is in use by another app, or the USB connection dropped. Unplug and replug, close other camera apps, then try again.';
            } else {
                hint = err.message;
            }
            $('#camera-error-title').text('Camera error: ' + err.name);
            $('#camera-error-msg').text(hint);
            $('#camera-error-card').slideDown(200);
        } finally {
            launchBtn.prop('disabled', false).html('<i class="fa-solid fa-rocket"></i> Launch Kiosk Mode');
        }
    });

    // --- Camera error card dismiss ---
    $('#btn-camera-error-close').on('click', function() {
        $('#camera-error-card').slideUp(200);
    });

    // Returns the SHA-256 hex digest of a PIN string, or '' for empty input.
    async function _hashPin(pin) {
        if (!pin) return '';
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // --- Kiosk PIN input (admin dashboard) ---
    // Hash on blur/change so we never keep the raw PIN in appConfig or localStorage.
    $('#kiosk-pin-input').on('change', async function() {
        const raw = this.value.trim();
        appConfig.kioskPin    = await _hashPin(raw);
        appConfig.kioskPinLen = raw.length;
        this.value = ''; // clear field — raw PIN must not persist in the DOM
        $('#kiosk-pin-status').html(raw.length > 0 ? '<i class="fa-solid fa-lock"></i> PIN set' : 'No PIN — exit without prompt');
        saveConfig();
    });

    // --- PIN modal logic ---
    let _pinBuffer = '';

    function _renderPinDisplay() {
        const len = _pinBuffer.length;
        const max = Math.max(len, 4);
        $('#pin-display').text(Array.from({ length: max }, (_, i) => i < len ? '●' : '–').join(''));
    }

    function _showPinModal() {
        _pinBuffer = '';
        _renderPinDisplay();
        $('#pin-error').hide();
        $('#pin-overlay').css('display', 'flex');
    }

    function _hidePinModal() {
        $('#pin-overlay').hide();
    }

    function _requestFullscreen() {
        const el = document.documentElement;
        const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
        if (fn) fn.call(el).catch(() => {});
    }

    function _exitFullscreen() {
        const fn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
        if (fn) fn.call(document).catch(() => {});
    }

    function _doExitKiosk() {
        stopVgRecordingIfActive();
        if (currentStream) { currentStream.getTracks().forEach(track => track.stop()); currentStream = null; }
        _teardownSinkBeep();
        _exitFullscreen();
        $('#kiosk-mode').hide();
        $('#vg-booth').hide();
        $('#live-booth').hide();
        $('#admin-dashboard').fadeIn(400);
    }

    $('#btn-exit-kiosk').on('click', function() {
        if (appConfig.kioskPin && appConfig.kioskPinLen > 0) {
            _showPinModal();
        } else {
            _doExitKiosk();
        }
    });

    $('#btn-pin-cancel').on('click', _hidePinModal);

    $('#btn-pin-del').on('click', function() {
        _pinBuffer = _pinBuffer.slice(0, -1);
        _renderPinDisplay();
        $('#pin-error').hide();
    });

    // Compare hash of entered digits against stored hash once enough digits entered.
    $(document).on('click', '.pin-key[data-k]', async function() {
        if (_pinBuffer.length >= 8) return;
        _pinBuffer += $(this).data('k').toString();
        _renderPinDisplay();
        $('#pin-error').hide();
        if (_pinBuffer.length >= appConfig.kioskPinLen && appConfig.kioskPinLen > 0) {
            const inputHash = await _hashPin(_pinBuffer);
            if (inputHash === appConfig.kioskPin) {
                _hidePinModal();
                _doExitKiosk();
            } else {
                $('#pin-error').show();
                _pinBuffer = '';
                _renderPinDisplay();
            }
        }
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

    // Prompts preview modal
    $('#btn-show-prompts-preview').on('click', function(e) {
        e.stopPropagation();
        const disabled = appConfig.vgDisabledTemplatePrompts;
        const prompts = [
            ...(PROMPT_TEMPLATES[appConfig.vgPromptCategory] || []).filter(function(q) { return disabled.indexOf(q) === -1; }),
            ...appConfig.vgCustomPrompts.filter(function(p) { return p.enabled; }).map(function(p) { return p.text; })
        ];
        const $list = $('#prompts-preview-list').empty();
        prompts.forEach(function(q) {
            $list.append($('<div class="prompt-preview-item">').text(q));
        });
        $('#prompts-preview-modal').css('display', 'flex');
    });

    $('#btn-close-prompts-preview').on('click', function() {
        $('#prompts-preview-modal').hide();
    });

    $('#prompts-preview-modal').on('click', function(e) {
        if ($(e.target).is('#prompts-preview-modal')) {
            $(this).hide();
        }
    });

    // Tap anywhere on the welcome screen to start (not just the small button)
    $('#guest-welcome').on('click', function(e) {
        if ($(e.target).closest('#btn-exit-kiosk, #btn-start-session, #btn-start-vg-session, #btn-show-prompts-preview, .welcome-vg-panel').length) return;
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

    // If fullscreen is exited while kiosk is active (e.g. Escape key), treat it as Exit button press
    document.addEventListener('fullscreenchange', function() {
        if (!document.fullscreenElement && $('#kiosk-mode').is(':visible')) {
            if (appConfig.kioskPin && appConfig.kioskPinLen > 0) {
                _showPinModal();
            } else {
                _doExitKiosk();
            }
        }
    });

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

    function _getVgPanelSubtitle() {
        const name = (appConfig.vgCoupleName || '').trim();
        if (name) return 'Answer just a few questions on video for ' + name + '.';
        return appConfig.vgPromptText || 'Share a message for the happy couple!';
    }

    function resetToWelcomeScreen() {
        // Hide capture screens
        $('#photo-canvas').hide();
        // Show the camera feed element
        $('#camera-feed').show();
        $('#processing-overlay').hide();
        $('#live-booth').hide();
        $('#vg-booth').hide();

        // Show the correct layout for the active mode
        const isVg = appConfig.captureMode === 'videoguestbook';
        $('#welcome-photo-content, #welcome-photo-action').toggle(!isVg);
        $('#btn-start-session').toggle(!isVg);
        if (isVg) {
            $('#welcome-vg-panel').css('display', 'flex');
            $('#live-ws-title-vg').text(appConfig.vgPanelTitle || 'Raise a Toast!');
            $('#live-ws-subtitle-vg').text(_getVgPanelSubtitle());
            $('#btn-show-prompts-preview').toggle(!!appConfig.vgPromptsEnabled);
        } else {
            $('#welcome-vg-panel').hide();
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
                        const $card = $('<div class="rcm-card" data-idx="' + idx + '"><img src="' + item.src + '" alt=""><div class="rcm-badge"><i class="fa-solid fa-camera"></i></div></div>');
                        $grid.append($card);
                    } else {
                        const $card = $('<div class="rcm-card rcm-card-video" data-idx="' + idx + '"><video src="' + item.src + '" muted playsinline preload="metadata"></video><div class="rcm-badge"><i class="fa-solid fa-clapperboard"></i></div><div class="rcm-play-icon"><i class="fa-solid fa-play"></i></div></div>');
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
            showQrOverlay(_currentPbDriveLink, 'Scan to view your photos');
        }
    });

    // VG preview overlay — QR button
    $('#btn-vg-qr').on('click', function() {
        if (_currentVgDriveLink) {
            showQrOverlay(_currentVgDriveLink, 'Scan to view your captures');
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

    async function hideShareOverlay() {
        clearInterval(_shareCountdownTimer);
        await new Promise(resolve => {
            $('#share-overlay').fadeOut(200, () => {
                $('#share-preview-img').attr('src', '');
                if (_shareObjectUrl) { URL.revokeObjectURL(_shareObjectUrl); _shareObjectUrl = null; }
                resolve();
            });
        });
        if (appConfig.vgThankYouEnabled) {
            await showVgThankYou();
        }
        $('#processing-overlay h2').text('Processing...');
        $('.spinner').show();
        resetToWelcomeScreen();
    }
    // =========================================================

    async function triggerCaptureSequence(opts = {}) {
        try {
            // Start a new guest session (skip when continuing from a VG session to share the folder)
            if (!opts.continueSession) startNewSession();

            $('#live-booth').show();

            // Show photo booth splash screen if enabled
            if (appConfig.pbSplashEnabled) {
                const def = LAYOUT_DEFS[appConfig.layout] || LAYOUT_DEFS['4x6-1'];
                const photoCount = def.cols * def.rows;
                const subMsg = photoCount === 1
                    ? 'You\'ve got <strong>1 shot</strong> — make it amazing! Strike your best pose and have fun! 🤩'
                    : 'You\'ll take <strong>' + photoCount + ' photos</strong> — warm up, get creative, and show us your best side! ✨';
                document.getElementById('pb-splash-sub').innerHTML = subMsg;
                const pbSplashEl = document.getElementById('pb-splash');
                pbSplashEl.classList.remove('splash-fade-out');
                pbSplashEl.style.display = 'flex';
                await new Promise(r => setTimeout(r, appConfig.pbSplashDuration * 1000));
                pbSplashEl.classList.add('splash-fade-out');
                await new Promise(r => setTimeout(r, SPLASH_FADE_OUT_DURATION_MS));
                pbSplashEl.style.display = 'none';
                pbSplashEl.classList.remove('splash-fade-out');
            }

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
        } catch (err) {
            console.error('[Capture] Fatal error in capture sequence:', err);
            resetToWelcomeScreen();
        }
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

    let _vgFrameAnimId = null;      // rAF id for canvas compositing loop
    let _vgSaving = false;          // guard: prevents saveVgVideo from running twice per session
    let _vgActivePromptText = null; // prompt from current/last recording, preserved for redo
    let _vgLiveAudioTracks = [];    // mic tracks for the current recording; stopped in onstop to release Android COMMUNICATION mode

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

    const SPLASH_FADE_OUT_DURATION_MS = 400;  // must match CSS @keyframes splash-fade-out duration

    async function triggerVgSequence(opts = {}) {
      try {
        // Start a new guest session (skip on redo to preserve session folder and prompt)
        if (!opts.continueSession) startNewSession();

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
            const _disabled = appConfig.vgDisabledTemplatePrompts;
            const _prompts = [
                ...(PROMPT_TEMPLATES[appConfig.vgPromptCategory] || []).filter(function(q) { return _disabled.indexOf(q) === -1; }),
                ...appConfig.vgCustomPrompts.filter(function(p) { return p.enabled; }).map(function(p) { return p.text; })
            ];
            if (_prompts.length > 0) {
                // On redo reuse the same prompt; otherwise pick randomly
                _activePromptText = opts.promptText || _prompts[Math.floor(Math.random() * _prompts.length)];
                _vgActivePromptText = _activePromptText;

                // Show splash screen first
                const _splashEl = document.getElementById('vg-prompt-splash');
                _splashEl.classList.remove('splash-fade-out');
                _splashEl.style.display = 'flex';
                await new Promise(r => setTimeout(r, appConfig.vgSplashDuration * 1000));
                _splashEl.classList.add('splash-fade-out');
                await new Promise(r => setTimeout(r, SPLASH_FADE_OUT_DURATION_MS)); // match fade-out duration
                _splashEl.style.display = 'none';
                _splashEl.classList.remove('splash-fade-out');

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

        // Re-acquire the microphone now that the countdown is done.
        // We stopped it at kiosk launch to keep Android in media audio mode (A2DP) so that
        // beeps played above reached the Bluetooth speaker instead of the internal speaker.
        _vgLiveAudioTracks = [];
        try {
            const _micConstraint = appConfig.vgSelectedMicId
                ? { deviceId: { exact: appConfig.vgSelectedMicId } }
                : true;
            const _micStream = await navigator.mediaDevices.getUserMedia({ audio: _micConstraint });
            _vgLiveAudioTracks = _micStream.getAudioTracks();
        } catch (e) {
            console.warn('[VG] Could not re-acquire preferred mic, trying default:', e.message);
            try {
                const _fallbackStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                _vgLiveAudioTracks = _fallbackStream.getAudioTracks();
            } catch (e2) {
                console.warn('[VG] No mic available for recording:', e2.message);
            }
        }

        // Build the stream to record.
        // If an overlay is configured, composite camera + overlay on a canvas
        // and record the canvas stream (video) + audio from the freshly acquired mic tracks.
        let recordStream = new MediaStream([...currentStream.getVideoTracks(), ..._vgLiveAudioTracks]);
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
            const combinedStream = new MediaStream([
                ...canvasVideoStream.getVideoTracks(),
                ..._vgLiveAudioTracks
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
            // Stop mic tracks immediately so Android exits MODE_IN_COMMUNICATION.
            // This restores A2DP Bluetooth routing before review playback begins.
            _vgLiveAudioTracks.forEach(t => { try { t.stop(); } catch (e) {} });
            _vgLiveAudioTracks = [];
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
      } catch (err) {
        console.error('[VG] Fatal error in VG sequence:', err);
        stopVgRecordingIfActive();
        resetToWelcomeScreen();
      }
    }

    $('#btn-vg-stop').on('click', function() {
        stopVgRecordingIfActive();
    });

    $('#btn-vg-redo').on('click', function() {
        // Discard the current recording without saving
        const recorder = _vgMediaRecorder;
        _vgMediaRecorder = null;
        if (recorder && recorder.state !== 'inactive') {
            recorder.onstop = null; // prevent the save handler from firing
            try { recorder.stop(); } catch(e) {}
        }
        clearInterval(_vgTimerInterval);
        clearTimeout(_vgMaxTimer);
        if (_vgFrameAnimId) { cancelAnimationFrame(_vgFrameAnimId); _vgFrameAnimId = null; }

        // Reset recording state
        _vgChunks = [];
        _vgElapsed = 0;
        _vgSaving = false;

        // Reset UI back to pre-recording state
        $('#vg-hud').hide();
        $('#vg-controls').hide();
        $('#vg-timer').text('0:00');
        $('#vg-time-left').text('').css('color', '#fff');
        $('#vg-prompt-sidebar').hide();
        const ol = document.getElementById('vg-overlay-live');
        if (ol) ol.style.display = 'none';

        // Restart with the same session and same prompt so the guest doesn't get a new question
        triggerVgSequence({ continueSession: true, promptText: _vgActivePromptText });
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
        _evictOldCaptures();
        updateDashboardGallery();
        // Broadcast thumbnail to Live Viewer peers (fire-and-forget)
        lvBroadcastVideo(galleryBlobUrl, filename);

        // Save locally (folder or download)
        if (appConfig.vgSaveLocal) {
            try {
                if (directoryHandle) {
                    const sessionDir = await directoryHandle.getDirectoryHandle(currentSessionId || 'session', { create: true });
                    const fileHandle = await sessionDir.getFileHandle(filename, { create: true });
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
        // Show QR for session folder (not individual file)
        if (appConfig.vgSaveDrive && _getVgDriveClientId() && !_getVgDriveClientId().startsWith('YOUR_CLIENT')) {
            uploadVgToDrive(blob, filename).then(async result => {
                // The session folder link is already set after creating the folder
                if (currentSessionFolderLink) {
                    _currentVgDriveLink = currentSessionFolderLink;
                    // Store session folder link in gallery for admin view
                    capturedVideoDriveLinks[0] = currentSessionFolderLink;
                    _appendGalleryQrBtn(0, 'video', currentSessionFolderLink);
                    // Notify live viewer peers
                    lvBroadcastDriveUpdate(filename, currentSessionFolderLink);
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
        if (appConfig.vgCaptureReviewEnabled) {
            await showVgPreview(galleryBlobUrl);
        }

        // Offer the guest a photo strip if the feature is enabled
        if (appConfig.vgOfferPb) {
            const wantsPb = await showVgPbOffer();
            if (wantsPb) {
                $('#vg-booth').hide();
                if (currentStream) {
                    // VG may include microphone audio; disable it before PB capture.
                    const videoTracks = currentStream.getVideoTracks().filter(t => t.readyState === 'live');
                    const audioTracks = currentStream.getAudioTracks();
                    audioTracks.forEach(track => {
                        try { track.stop(); } catch (e) {}
                    });
                    if (videoTracks.length > 0) {
                        currentStream = new MediaStream(videoTracks);
                    }
                }
                const pbFeedEl = $('#camera-feed')[0];
                if (pbFeedEl && currentStream) {
                    pbFeedEl.srcObject = currentStream;
                    try {
                        await pbFeedEl.play();
                    } catch (e) {
                        // Playback can be momentarily blocked while transitioning overlays.
                    }
                }
                $('#photo-canvas').hide();
                $('#camera-feed').show();
                applyKioskViewfinderSize();
                await triggerCaptureSequence({ continueSession: true }); // reuse same session folder so photo lands alongside the video
                return; // triggerCaptureSequence handles its own thank-you and resetToWelcomeScreen
            }
        }

        // Show QR screen so guest can scan to get their video
        if (appConfig.vgSaveDrive && currentSessionFolderLink) {
            await showVgQrScreen('Scan to get your video!');
        }

        // Show VG thank-you then reset
        if (appConfig.vgThankYouEnabled) {
            await showVgThankYou();
        }

        $('#vg-booth').hide();
        resetToWelcomeScreen();
    }

    function showVgPbOffer() {
        return new Promise(function(resolve) {
            const overlay     = document.getElementById('vg-pb-offer');
            const countdownEl = document.getElementById('vg-pbo-countdown');
            const yesBtn      = document.getElementById('btn-vg-pbo-yes');
            const noBtn       = document.getElementById('btn-vg-pbo-no');
            const SECS        = 15;
            let remaining     = SECS;

            countdownEl.textContent = '(' + remaining + ')';
            overlay.style.display = 'flex';

            const timer = setInterval(function() {
                remaining--;
                countdownEl.textContent = '(' + remaining + ')';
                if (remaining <= 0) finish(false);
            }, 1000);

            function finish(accepted) {
                clearInterval(timer);
                overlay.style.display = 'none';
                yesBtn.removeEventListener('click', onYes);
                noBtn.removeEventListener('click', onNo);
                resolve(accepted);
            }

            function onYes() { finish(true);  }
            function onNo()  { finish(false); }

            yesBtn.addEventListener('click', onYes);
            noBtn.addEventListener('click', onNo);
        });
    }

    function showVgQrScreen(label) {
        return new Promise(resolve => {
            if (!currentSessionFolderLink) { resolve(); return; }
            const overlay     = document.getElementById('vg-qr-screen');
            const container   = document.getElementById('vg-qr-screen-container');
            const countdownEl = document.getElementById('vg-qr-screen-countdown');
            const doneBtn     = document.getElementById('btn-vg-qr-screen-done');
            const labelEl     = document.getElementById('vg-qr-screen-label');

            if (labelEl) labelEl.textContent = label || 'Scan to get your copy!';

            container.innerHTML = '';
            new QRCode(container, {
                text: currentSessionFolderLink,
                width: 260,
                height: 260,
                colorDark: '#111827',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.M
            });

            overlay.style.display = 'flex';
            const SECS = 25;
            let remaining = SECS;
            countdownEl.textContent = remaining;
            const timer = setInterval(function() {
                remaining--;
                countdownEl.textContent = remaining;
                if (remaining <= 0) finish();
            }, 1000);

            function finish() {
                clearInterval(timer);
                overlay.style.display = 'none';
                doneBtn.removeEventListener('click', finish);
                resolve();
            }
            doneBtn.addEventListener('click', finish);
        });
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
            playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
            muteBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
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
            function onPlay()  { playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>'; }
            function onPause() { playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>'; }
            function onMute() {
                video.muted = !video.muted;
                muteBtn.innerHTML = video.muted ? '<i class="fa-solid fa-volume-xmark"></i>' : '<i class="fa-solid fa-volume-high"></i>';
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
                    playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
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

            const _startPreviewPlay = () => {
                video.play().catch(() => {
                    msg.textContent = 'Tap play to preview your message.';
                    playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
                });
            };
            // Prefer AudioContext routing (already wired at kiosk launch via _setupSinkBeep —
            // no extra audiooutput permission required). Fall back to setSinkId for cases where
            // the speaker was configured but AudioContext routing failed.
            if (_previewVideoSourceNode) {
                _startPreviewPlay();
            } else if (appConfig.vgSelectedSpeakerId && typeof video.setSinkId === 'function') {
                video.setSinkId(appConfig.vgSelectedSpeakerId).then(_startPreviewPlay).catch(_startPreviewPlay);
            } else {
                _startPreviewPlay();
            }
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

    // Cap how many captures are kept in the in-memory gallery to bound RAM growth.
    // Files are already saved to disk/Drive; these arrays are only for the dashboard preview.
    const MAX_GALLERY_PHOTOS = 30;
    const MAX_GALLERY_VIDEOS = 10;
    function _evictOldCaptures() {
        while (capturedPhotos.length > MAX_GALLERY_PHOTOS) {
            capturedPhotos.pop();           // data URL string — GC reclaims the memory
            capturedPhotoDriveLinks.pop();
        }
        while (capturedVideos.length > MAX_GALLERY_VIDEOS) {
            const old = capturedVideos.pop();
            capturedVideoDriveLinks.pop();
            if (old && old.startsWith('blob:')) URL.revokeObjectURL(old); // release the binary blob
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
                    const sessionDir = await directoryHandle.getDirectoryHandle(currentSessionId || 'session', { create: true });
                    const fileHandle = await sessionDir.getFileHandle(filename, { create: true });
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

        // SAVE IMAGE TO ADMIN DASHBOARD GALLERY
        const photoDataUrl = canvas.toDataURL('image/png', 0.8);
        capturedPhotos.unshift(photoDataUrl);
        capturedPhotoDriveLinks.unshift(null); // will be updated after Drive upload completes
        _evictOldCaptures();
        updateDashboardGallery();
        // Broadcast to Live Viewer peers (fire-and-forget)
        lvBroadcastPhoto(photoDataUrl, filename);

        // --- Upload to Google Drive (fire-and-forget, non-blocking) ---
        // Upload file to session folder and show QR for the folder (not individual file)
        if (appConfig.saveDrive && _getVgDriveClientId() && !_getVgDriveClientId().startsWith('YOUR_CLIENT')) {
            canvas.toBlob(async function(blob) {
                try {
                    const result = await uploadToDrive(blob, filename);
                    console.log('[Drive] Uploaded:', filename);
                    // The session folder link is already set after creating the folder
                    // Show QR button in share overlay with the session folder link (if it's still open)
                    if ($('#share-overlay').is(':visible') && currentSessionFolderLink) {
                        _currentPbDriveLink = currentSessionFolderLink;
                        $('#btn-share-qr').fadeIn(200);
                    }
                    // Store session folder link in gallery for admin view
                    if (currentSessionFolderLink) {
                        capturedPhotoDriveLinks[0] = currentSessionFolderLink;
                        _appendGalleryQrBtn(0, 'photo', currentSessionFolderLink);
                        lvBroadcastDriveUpdate(filename, currentSessionFolderLink);
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
            setTimeout(async () => {
                if (appConfig.vgThankYouEnabled) {
                    await showVgThankYou();
                }
                $('#processing-overlay h2').text('Processing...');
                $('.spinner').show();
                resetToWelcomeScreen();
            }, previewMs);
        }
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
    let _audioCtx    = null;
    let _sinkBeepCtx  = null;  // separate AudioContext whose output feeds _sinkBeepEl
    let _sinkBeepDest = null;  // MediaStreamDestination connected to _sinkBeepEl
    let _sinkBeepEl   = null;  // hidden Audio element with setSinkId applied to the BT speaker
    let _previewVideoSourceNode = null; // MediaElementSource for #vg-preview-video, wired to _sinkBeepDest

    function _getAudioCtx() {
        if (!_audioCtx || _audioCtx.state === 'closed') {
            _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (_audioCtx.state === 'suspended') _audioCtx.resume();
        return _audioCtx;
    }

    // Call once from a user-gesture context (kiosk launch) to pre-wire beep audio to the
    // selected Bluetooth speaker. Keeps the Audio element playing silence so that subsequent
    // oscillator connections route instantly without needing another gesture.
    // When sinkId is empty (default speaker), skip special routing to allow the browser to use
    // its native audio output (fixes Android Chrome routing to BT when internal speaker is desired).
    function _setupSinkBeep(sinkId) {
        if (_sinkBeepCtx && _sinkBeepCtx.state !== 'closed') {
            _sinkBeepCtx.close().catch(() => {});
        }
        _sinkBeepCtx = null; _sinkBeepDest = null; _sinkBeepEl = null;
        // Pre-warm the fallback AudioContext while the user-gesture (kiosk launch) is
        // still active so countdown beeps are not blocked by autoplay policy later.
        try {
            if (!_audioCtx || _audioCtx.state === 'closed') {
                _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (_audioCtx.state === 'suspended') _audioCtx.resume().catch(() => {});
        } catch (e) { /* ignore */ }
        // Only set up special audio routing when a specific speaker is explicitly selected.
        // An empty sinkId means "default speaker" — let the browser handle native routing.
        if (!sinkId || typeof Audio === 'undefined' || typeof Audio.prototype.setSinkId === 'undefined') return;
        try {
            _sinkBeepCtx  = new (window.AudioContext || window.webkitAudioContext)();
            _sinkBeepDest = _sinkBeepCtx.createMediaStreamDestination();
            _sinkBeepEl   = new Audio();
            _sinkBeepEl.srcObject = _sinkBeepDest.stream;
            _sinkBeepEl.setSinkId(sinkId)
                .then(() => {
                    _sinkBeepEl.play().catch(() => {});
                    // Route the capture-review video through the same BT sink.
                    // createMediaElementSource silences the element's native output and
                    // sends audio through _sinkBeepDest → _sinkBeepEl → selected speaker,
                    // bypassing the OS default output (which may be the USB mic device).
                    const previewVid = document.getElementById('vg-preview-video');
                    if (previewVid && _sinkBeepCtx && _sinkBeepCtx.state !== 'closed') {
                        try {
                            _previewVideoSourceNode = _sinkBeepCtx.createMediaElementSource(previewVid);
                            _previewVideoSourceNode.connect(_sinkBeepDest);
                        } catch (e) {
                            console.warn('[VG] Preview video audio routing error:', e.message);
                        }
                    }
                })
                .catch(() => {
                    // Permission not granted for this deviceId — fall back to default output
                    _sinkBeepCtx.close().catch(() => {});
                    _sinkBeepCtx = null; _sinkBeepDest = null; _sinkBeepEl = null; _previewVideoSourceNode = null;
                });
        } catch (e) {
            _sinkBeepCtx = null; _sinkBeepDest = null; _sinkBeepEl = null;
        }
    }

    function _teardownSinkBeep() {
        if (_previewVideoSourceNode) { try { _previewVideoSourceNode.disconnect(); } catch (_) {} }
        _previewVideoSourceNode = null;
        if (_sinkBeepCtx && _sinkBeepCtx.state !== 'closed') _sinkBeepCtx.close().catch(() => {});
        _sinkBeepCtx = null; _sinkBeepDest = null; _sinkBeepEl = null;
    }

    function _playBeep(freq, duration, volume) {
        try {
            // Route through the pre-wired Bluetooth sink when available; otherwise default output.
            const ctx  = (_sinkBeepCtx && _sinkBeepCtx.state !== 'closed') ? _sinkBeepCtx  : _getAudioCtx();
            const dest = (ctx === _sinkBeepCtx && _sinkBeepDest)           ? _sinkBeepDest : ctx.destination;
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(dest);
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(volume || 0.45, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + duration);
        } catch (e) { /* audio not available */ }
    }

    // Play a short 880 Hz tone through the given audio output device (or default if sinkId is empty).
    // Routes via a hidden Audio element so setSinkId() can override Android's default routing
    // (needed when a USB mic is connected and Android steals default audio output away from Bluetooth).
    function _testSpeakerOutput(sinkId) {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const dest = ctx.createMediaStreamDestination();
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(dest);
            osc.type = 'sine';
            osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.4, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.5);

            const el = new Audio();
            el.srcObject = dest.stream;
            const startPlay = () => {
                el.play().catch(() => {});
                setTimeout(() => { el.srcObject = null; ctx.close(); }, 1200);
            };
            if (sinkId && typeof el.setSinkId === 'function') {
                el.setSinkId(sinkId).then(startPlay).catch(startPlay);
            } else {
                startPlay();
            }
        } catch (e) { /* audio not available */ }
    }

    $('#btn-test-speaker').on('click', function() {
        _testSpeakerOutput(appConfig.vgSelectedSpeakerId);
    });

    $('#btn-grant-audio-output').on('click', async function() {
        if (typeof navigator.mediaDevices.selectAudioOutput !== 'function') {
            $(this).hide();
            return;
        }
        const btn = $(this);
        btn.prop('disabled', true).text('Opening picker…');
        try {
            const device = await navigator.mediaDevices.selectAudioOutput();
            appConfig.vgSelectedSpeakerId = device.deviceId;
            await populateVgAudioDeviceList();
            // Re-select the device that was just granted
            const spkSel = document.getElementById('vg-speaker-select');
            if ([...spkSel.options].some(o => o.value === device.deviceId)) {
                spkSel.value = device.deviceId;
                appConfig.vgSelectedSpeakerId = device.deviceId;
            }
            saveConfig();
        } catch (e) {
            if (e.name !== 'AbortError') {
                const diag = document.getElementById('vg-audio-diag');
                if (diag) diag.innerHTML += `<span style="color:#dc2626; display:block;"><i class="fa-solid fa-triangle-exclamation"></i> ${e.message}</span>`;
            }
        } finally {
            btn.prop('disabled', false).html('<i class="fa-solid fa-key"></i> Grant Bluetooth Access');
        }
    });
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
    $('#event-name-input').on('input', function() {
        appConfig.eventName = this.value.trim();
        $('#event-name-input').val(appConfig.eventName);
        // Reset event sub-folder cache so the new name creates a fresh sub-folder
        appConfig._driveEventFolderId = null;
        appConfig._vgDriveEventFolderId = null;
        _updateFilenamePreview();
        _updateEventNameWarnings();
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

    // ── Sync all UI controls to the loaded appConfig ──────────────────────────
    // Called once after all event handlers are wired so that the DOM reflects
    // whatever was restored from localStorage.
    function syncUIFromConfig() {

        // Layout radio
        $('input[name="layout"][value="' + appConfig.layout + '"]').prop('checked', true);
        updateTemplateSizeHint();

        // Capture settings are Video Guestbook-only.
        const capEl = document.getElementById('cap-tab-videoguestbook');
        if (capEl) capEl.style.display = '';
        updateAdvancedNavForMode(appConfig.captureMode);

        // Event name
        $('#event-name-input').val(appConfig.eventName);
        if (appConfig.eventName) {
            const prefix = appConfig.eventName.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
            $('#filename-preview').text(prefix + '_YYYYMMDD_HHMMSS.png');
        }

        // Kiosk PIN — field is always empty; we only store the hash
        $('#kiosk-pin-input').val('');
        $('#kiosk-pin-status').html(appConfig.kioskPin ? '<i class="fa-solid fa-lock"></i> PIN set' : 'No PIN — exit without prompt');

        // Countdown sliders
        $('#setting-cd-1').val(appConfig.countdownFirst);
        $('#val-cd-1').text(appConfig.countdownFirst);
        $('#setting-cd-others').val(appConfig.countdownOthers);
        $('#val-cd-others').text(appConfig.countdownOthers);
        $('#setting-review').val(appConfig.reviewTime);
        $('#val-review').text(appConfig.reviewTime);

        // Welcome screen
        $('#edit-bg-color').val(appConfig.welcomeBg);
        $('#color-hex').text(appConfig.welcomeBg);
        $('#edit-title').val(appConfig.welcomeTitle);
        $('#edit-subtitle').val(appConfig.welcomeSubtitle);
        $('#prev-title, #live-ws-title').text(appConfig.welcomeTitle);
        $('#prev-subtitle, #live-ws-subtitle').text(appConfig.welcomeSubtitle);
        $('#edit-vg-panel-title').val(appConfig.vgPanelTitle || 'Raise a Toast!');
        $('#edit-vg-couple-name').val(appConfig.vgCoupleName || '');
        $('#vg-couple-name-preview').text(appConfig.vgCoupleName || 'Alice & Dan');
        $('#live-ws-title-vg').text(appConfig.vgPanelTitle || 'Raise a Toast!');
        if (!appConfig.welcomeMedia) {
            $('#designer-preview, #guest-welcome').css('background-color', appConfig.welcomeBg);
        }

        // Photo mode toggle
        $('#toggle-photo-mode').prop('checked', appConfig.photoMode)
            .closest('.toggle-switch').toggleClass('is-on', appConfig.photoMode);
        $('#toggle-photo-label').text(appConfig.photoMode ? 'ON' : 'OFF');

        // Social share toggle
        $('#toggle-social-share').prop('checked', appConfig.socialShare)
            .closest('.toggle-switch').toggleClass('is-on', appConfig.socialShare);
        $('#toggle-social-label').text(appConfig.socialShare ? 'ON' : 'OFF');

        // Storage — Photo Booth
        $('#chk-save-local').prop('checked', appConfig.saveLocal);
        $('#chk-save-drive').prop('checked', appConfig.saveDrive);

        // Camera — Photo Booth
        const fmVal = appConfig.facingMode || 'user';
        $('input[name="facing-mode"][value="' + fmVal + '"]').prop('checked', true);
        $('#camera-specific-card').toggle(appConfig.facingMode === '');
        if (appConfig.selectedCameraId) $('#camera-select').val(appConfig.selectedCameraId);

        // VG settings
        $('#setting-vg-duration').val(appConfig.vgMaxDuration);
        $('#val-vg-duration').text(appConfig.vgMaxDuration);
        $('#setting-vg-countdown').val(appConfig.vgCountdown);
        $('#val-vg-countdown').text(appConfig.vgCountdown);
        $('#setting-vg-prompt').val(appConfig.vgPromptText);
        const vgFmVal = appConfig.vgFacingMode || 'user';
        $('input[name="vg-facing-mode"][value="' + vgFmVal + '"]').prop('checked', true);
        $('#vg-camera-specific-card').toggle(appConfig.vgFacingMode === '');
        if (appConfig.vgSelectedCameraId) $('#vg-camera-select').val(appConfig.vgSelectedCameraId);

        // VG storage
        $('#chk-vg-save-local').prop('checked', appConfig.vgSaveLocal);
        $('#vg-local-folder-config').toggle(appConfig.vgSaveLocal);
        $('#chk-vg-save-drive').prop('checked', appConfig.vgSaveDrive);
        $('#vg-drive-config').toggle(appConfig.vgSaveDrive);
        $('#vg-drive-folder-name').val(appConfig.vgDriveFolderName);
        if (appConfig.vgDriveClientId) $('#vg-drive-client-id').val(appConfig.vgDriveClientId);

        // VG prompts — category button (toggle/list handled by initVgPrompts above)
        $('.prompt-cat-btn').removeClass('active');
        $('.prompt-cat-btn[data-cat="' + appConfig.vgPromptCategory + '"]').addClass('active');

        // VG prompts — splash screen duration
        $('#setting-vg-splash-duration').val(appConfig.vgSplashDuration);
        $('#val-vg-splash-duration').text(appConfig.vgSplashDuration);

        // Photo Booth splash screen
        $('#setting-pb-splash-duration').val(appConfig.pbSplashDuration);
        $('#val-pb-splash-duration').text(appConfig.pbSplashDuration);

        // VG thank you duration (toggle handled by initVgThankYou above)
        $('#setting-ty-duration').val(appConfig.vgThankYouDuration);
        $('#val-ty-duration').text(appConfig.vgThankYouDuration);

        // Live Viewer network address
        $('#lv-network-addr').val(appConfig.lvNetworkAddr || '');

        _updateEventNameWarnings();
    }

    syncUIFromConfig();

    // Auto-save on any admin UI input change (covers text, checkboxes, radios, selects, sliders)
    $(document).on('change input',
        '#admin-dashboard input, #admin-dashboard select, #admin-dashboard textarea',
        _scheduleSave
    );

});