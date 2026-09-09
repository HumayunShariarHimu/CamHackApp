(function() {
    'use strict';

    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const captureBtn = document.getElementById('captureBtn');
    const flipBtn = document.getElementById('flipBtn');
    const effectToggleBtn = document.getElementById('effectToggleBtn');
    const effectPanel = document.getElementById('effectPanel');
    const effectBtns = document.querySelectorAll('.effect-btn');
    const statusText = document.getElementById('statusText');
    const fpsCounter = document.getElementById('fpsCounter');
    const overlay = document.getElementById('cameraOverlay');
    const countdownOverlay = document.getElementById('countdownOverlay');
    const countdownNumber = document.getElementById('countdownNumber');
    const galleryGrid = document.getElementById('galleryGrid');
    const galleryCount = document.getElementById('galleryCount');
    const clearGalleryBtn = document.getElementById('clearGalleryBtn');
    const navBtns = document.querySelectorAll('.nav-btn');
    const tabs = {
        camera: document.getElementById('camera-tab'),
        gallery: document.getElementById('gallery-tab')
    };

    let stream = null;
    let facingMode = 'environment';
    let currentEffect = 'none';
    let isEffectPanelOpen = false;
    let captureInProgress = false;
    let frameCount = 0;
    let lastFpsTime = performance.now();

    async function startCamera(facing = 'environment') {
        try {
            if (!window.isSecureContext) {
                throw new Error('Camera requires HTTPS. Open the https:// production URL.');
            }
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('This browser does not support camera access.');
            }
            if (stream) {
                stream.getTracks().forEach(t => t.stop());
            }
            const constraints = {
                video: {
                    facingMode: facing,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            };
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;
            await video.play();
            overlay.style.display = 'none';
            statusText.innerHTML = '● LIVE';
            return true;
        } catch (err) {
            console.error('Camera error:', err);
            overlay.style.display = 'flex';
            overlay.querySelector('.overlay-text').textContent = err.name === 'NotAllowedError'
                ? 'CAMERA PERMISSION DENIED'
                : 'CAMERA ERROR';
            overlay.title = err.message || 'Allow camera permission and reload the page.';
            statusText.innerHTML = '✖ ERROR';
            return false;
        }
    }

    function applyEffect(ctx, width, height, effect) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const len = data.length;

        switch (effect) {
            case 'neon':
                for (let i = 0; i < len; i += 4) {
                    const r = data[i], g = data[i+1], b = data[i+2];
                    data[i] = Math.min(255, r * 1.5);
                    data[i+1] = Math.min(255, g * 0.7);
                    data[i+2] = Math.min(255, b * 2.0);
                }
                break;
            case 'cyber':
                for (let i = 0; i < len; i += 4) {
                    const r = data[i], g = data[i+1], b = data[i+2];
                    data[i] = Math.min(255, r * 0.3 + g * 0.6);
                    data[i+1] = Math.min(255, g * 0.8 + b * 0.4);
                    data[i+2] = Math.min(255, b * 1.2 + r * 0.2);
                }
                break;
            case 'matrix':
                for (let i = 0; i < len; i += 4) {
                    const gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
                    data[i] = gray * 0.2;
                    data[i+1] = gray * 1.8;
                    data[i+2] = gray * 0.2;
                }
                break;
            case 'vapor':
                for (let i = 0; i < len; i += 4) {
                    const r = data[i], g = data[i+1], b = data[i+2];
                    data[i] = Math.min(255, r * 1.2 + b * 0.5);
                    data[i+1] = Math.min(255, g * 0.6);
                    data[i+2] = Math.min(255, b * 1.6 + r * 0.3);
                }
                break;
            case 'glitch':
                for (let i = 0; i < len; i += 4) {
                    if (i % 20 < 3) {
                        const tmp = data[i];
                        data[i] = data[i+1];
                        data[i+1] = data[i+2];
                        data[i+2] = tmp;
                    }
                }
                break;
            case 'pixel':
                const step = 4;
                for (let y = 0; y < height; y += step) {
                    for (let x = 0; x < width; x += step) {
                        const idx = (y * width + x) * 4;
                        const r = data[idx], g = data[idx+1], b = data[idx+2];
                        for (let dy = 0; dy < step && y+dy < height; dy++) {
                            for (let dx = 0; dx < step && x+dx < width; dx++) {
                                const i2 = ((y+dy) * width + (x+dx)) * 4;
                                data[i2] = r;
                                data[i2+1] = g;
                                data[i2+2] = b;
                            }
                        }
                    }
                }
                break;
            case 'invert':
                for (let i = 0; i < len; i += 4) {
                    data[i] = 255 - data[i];
                    data[i+1] = 255 - data[i+1];
                    data[i+2] = 255 - data[i+2];
                }
                break;
            default:
                break;
        }
        ctx.putImageData(imageData, 0, 0);
    }

    function captureFrame(effect) {
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 480;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, w, h);
        if (effect && effect !== 'none') {
            applyEffect(ctx, w, h, effect);
        }
        return canvas.toDataURL('image/jpeg', 0.92);
    }

    async function uploadImage(dataUrl) {
        try {
            const blob = await (await fetch(dataUrl)).blob();
            const formData = new FormData();
            formData.append('image', blob, `capture-${Date.now()}.jpg`);

            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            const json = await res.json();
            if (json.success) {
                return json.file;
            } else {
                throw new Error(json.error || 'Upload failed');
            }
        } catch (err) {
            console.error('Upload error:', err);
            statusText.innerHTML = '✖ UPLOAD FAILED';
            return null;
        }
    }

    async function captureWithCountdown() {
        if (captureInProgress) return;
        captureInProgress = true;

        countdownOverlay.style.display = 'flex';
        for (let i = 3; i > 0; i--) {
            countdownNumber.textContent = i;
            await new Promise(r => setTimeout(r, 400));
        }
        countdownOverlay.style.display = 'none';

        const dataUrl = captureFrame(currentEffect);
        const file = await uploadImage(dataUrl);
        if (file) {
            statusText.innerHTML = '✔ CAPTURED';
            setTimeout(() => statusText.innerHTML = '● LIVE', 1500);
            await loadGallery();
        } else {
            statusText.innerHTML = '✖ ERROR';
        }
        captureInProgress = false;
    }

    async function loadGallery() {
        try {
            const res = await fetch('/api/images');
            const images = await res.json();
            renderGallery(images);
            galleryCount.textContent = images.length + ' items';
        } catch (err) {
            console.error('Gallery load error:', err);
            galleryGrid.innerHTML = `<div class="gallery-empty"><span class="empty-icon">⌘</span><p>Failed to load gallery</p></div>`;
        }
    }

    function renderGallery(images) {
        if (!images || images.length === 0) {
            galleryGrid.innerHTML = `
                <div class="gallery-empty">
                    <span class="empty-icon">⌘</span>
                    <p>No captures yet</p>
                    <span class="empty-sub">Point your camera and shoot</span>
                </div>
            `;
            return;
        }
        let html = '';
        images.forEach(img => {
            const date = new Date(parseInt(img.timestamp) || Date.now());
            const timeStr = date.toLocaleTimeString();
            html += `
                <div class="gallery-item" data-id="${img.id}">
                    <img src="${img.url}" alt="capture" loading="lazy" />
                    <div class="gallery-item-info">
                        <span>${timeStr}</span>
                        <div class="gallery-item-actions">
                            <button class="del-btn" data-id="${img.id}" title="Delete">✕</button>
                            <button class="download-btn" data-url="${img.url}" title="Download">⬇</button>
                        </div>
                    </div>
                </div>
            `;
        });
        galleryGrid.innerHTML = html;

        document.querySelectorAll('.del-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                if (confirm('Delete this capture?')) {
                    await deleteImage(id);
                    await loadGallery();
                }
            });
        });
        document.querySelectorAll('.download-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const url = btn.dataset.url;
                const a = document.createElement('a');
                a.href = url;
                a.download = 'capture.jpg';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            });
        });
    }

    async function deleteImage(id) {
        try {
            const res = await fetch(`/api/images/${id}`, { method: 'DELETE' });
            const json = await res.json();
            return json.success;
        } catch (err) {
            console.error('Delete error:', err);
            return false;
        }
    }

    async function clearAllGallery() {
        const items = document.querySelectorAll('.gallery-item');
        if (items.length === 0) return;
        if (!confirm('Delete all captures?')) return;
        for (const item of items) {
            const id = item.dataset.id;
            if (id) await deleteImage(id);
        }
        await loadGallery();
    }

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.dataset.tab;
            Object.keys(tabs).forEach(key => {
                tabs[key].classList.toggle('active', key === tab);
            });
            if (tab === 'gallery') {
                loadGallery();
            }
        });
    });

    captureBtn.addEventListener('click', captureWithCountdown);

    flipBtn.addEventListener('click', async () => {
        facingMode = (facingMode === 'environment') ? 'user' : 'environment';
        await startCamera(facingMode);
    });

    effectToggleBtn.addEventListener('click', () => {
        isEffectPanelOpen = !isEffectPanelOpen;
        effectPanel.style.display = isEffectPanelOpen ? 'block' : 'none';
    });

    effectBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            effectBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentEffect = btn.dataset.effect;
            statusText.innerHTML = `● EFFECT: ${currentEffect.toUpperCase()}`;
            setTimeout(() => statusText.innerHTML = '● LIVE', 1200);
        });
    });

    clearGalleryBtn.addEventListener('click', clearAllGallery);

    function updateFPS() {
        frameCount++;
        const now = performance.now();
        if (now - lastFpsTime >= 1000) {
            fpsCounter.textContent = `FPS: ${frameCount}`;
            frameCount = 0;
            lastFpsTime = now;
        }
        requestAnimationFrame(updateFPS);
    }

    (async function init() {
        await startCamera(facingMode);
        loadGallery();
        updateFPS();
    })();

})();
