// ─── Video stitch engine ──────────────────────────────────────────────────────
// Fix 7 note: True Web Worker offloading is not feasible here because
// HTMLVideoElement and AudioContext.createMediaElementSource() require DOM
// context unavailable in Workers. The rAF loop already yields between frames;
// the explicit per-clip rAF yield below ensures progress bar updates paint
// before each clip's heavy canvas work begins, keeping the UI responsive.

/**
 * Stitch an array of video blob URLs sequentially by replaying each on a
 * canvas and recording the canvas stream + audio via AudioContext.
 * Returns { blob, ext } where blob is video/mp4 or video/webm.
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
        // Yield one animation frame so the progress bar paints before the
        // canvas-heavy work for this clip begins.
        await new Promise(r => requestAnimationFrame(r));
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
