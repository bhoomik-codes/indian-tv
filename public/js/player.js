/* ============================================================
   IndiaStream — Player JS
   Custom HLS.js-powered video player with full controls
   ============================================================ */

// All URLs & ports come from js/config.js — edit that file to reconfigure.
const PLAYLIST_URL  = CONFIG_PLAYLIST_URL;
const LOCAL_WORKING = CONFIG_LOCAL_WORKING;
const LOCAL_PROXY   = CONFIG_LOCAL_PROXY;
const REMOTE_PROXY  = CONFIG_REMOTE_PROXY;

/** Wrap any URL so it goes through the local proxy server */
function proxyUrl(url) {
  return LOCAL_PROXY + encodeURIComponent(url);
}

/* ─── State ─── */
let hls              = null;
let allChannels      = [];
let currentChannel   = null;
let controlsTimer    = null;
let isPlaying        = false;
let isMuted          = false;
let isFullscreen     = false;
let sidebarFilter    = 'all';
let sidebarSearch    = '';
let retryCount       = 0;
const MAX_RETRIES    = 3;

/* ─── DOM Refs ─── */
const video          = document.getElementById('video-el');
const wrapper        = document.getElementById('video-wrapper');
const bufferingEl    = document.getElementById('buffering-overlay');
const errorEl        = document.getElementById('player-error-overlay');
const errorMsg       = document.getElementById('player-error-msg');
const controlsEl     = document.getElementById('controls-overlay');

const centerPlayBtn  = document.getElementById('center-play-btn');
const playPauseBtn   = document.getElementById('play-pause-btn');
const muteBtn        = document.getElementById('mute-btn');
const volSlider      = document.getElementById('volume-slider');
const fsBtn          = document.getElementById('fullscreen-btn');
const retryStreamBtn = document.getElementById('retry-stream-btn');

const sidebarList    = document.getElementById('sidebar-channel-list');
const sidebarTabs    = document.getElementById('sidebar-tabs');
const sidebarSearchEl = document.getElementById('sidebar-search');

const navChannelName = document.getElementById('nav-channel-name');
const ctrlLogoImg    = document.getElementById('ctrl-logo-img');
const ctrlLogoFb     = document.getElementById('ctrl-logo-fallback');
const ctrlChannelName = document.getElementById('ctrl-channel-name');

/* ─── Read URL Params ─── */
function getParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    url:   p.get('url')   || '',
    name:  p.get('name')  || 'Unknown Channel',
    logo:  p.get('logo')  || '',
    group: p.get('group') || 'General',
  };
}

/* ─── Initials ─── */
function getInitials(name) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ─── Category Helpers ─── */
const FALLBACK_CLASS = (cat) => {
  const key = (cat || 'default').toLowerCase();
  const map = { news: 'news', entertainment: 'entertainment', movies: 'movies', sports: 'sports', music: 'music', kids: 'kids', religious: 'religious', general: 'general' };
  return 'fallback-' + (map[key] || 'default');
};

/* ─── Proxy health check ─── */
let proxyAvailable = false;
async function checkProxy() {
  try {
    const res = await fetch('http://localhost:8081/health', { signal: AbortSignal.timeout(2000) });
    proxyAvailable = res.ok;
  } catch {
    proxyAvailable = false;
  }
  return proxyAvailable;
}

/* ─── Set Up Player for a Channel ─── */
function loadChannel(channel) {
  currentChannel = channel;
  retryCount     = 0;

  navChannelName.textContent    = channel.name;
  ctrlChannelName.textContent   = channel.name;
  document.title                = `${channel.name} — IndiaStream`;

  if (channel.logo) {
    ctrlLogoImg.src = channel.logo;
    ctrlLogoImg.style.display = 'block';
    ctrlLogoFb.style.display  = 'none';
    ctrlLogoImg.onerror = () => {
      ctrlLogoImg.style.display = 'none';
      ctrlLogoFb.style.display  = 'flex';
      setFallback(ctrlLogoFb, channel.name, channel.group);
    };
  } else {
    ctrlLogoImg.style.display = 'none';
    ctrlLogoFb.style.display  = 'flex';
    setFallback(ctrlLogoFb, channel.name, channel.group);
  }

  highlightSidebarItem(channel);
  showBuffering(true);
  showStreamError(false);
  startStream(channel.url);
}

function setFallback(el, name, group) {
  el.textContent  = getInitials(name);
  el.className    = `logo-fallback ${FALLBACK_CLASS(group)}`;
}

/* ─── Stream Setup (with proxy) ─── */
async function startStream(originalUrl) {
  // Always route through local proxy (which handles CORS + rewrites segments)
  const streamUrl = proxyAvailable
    ? proxyUrl(originalUrl)
    : originalUrl; // fallback: try direct (may fail CORS)

  if (hls) { hls.destroy(); hls = null; }

  if (Hls.isSupported()) {
    hls = new Hls({
      enableWorker:    true,
      lowLatencyMode:  true,
      backBufferLength: 30,
      maxBufferLength:  60,
      maxMaxBufferLength: 600,
      maxLoadingDelay:  4,
      manifestLoadingMaxRetry:  3,
      levelLoadingMaxRetry:     3,
      fragLoadingMaxRetry:      6,
      manifestLoadingRetryDelay: 1000,
      levelLoadingRetryDelay:   1000,
      fragLoadingRetryDelay:    1000,
    });

    hls.loadSource(streamUrl);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      playVideo();
    });

    hls.on(Hls.Events.ERROR, (event, data) => {
      console.warn('[HLS Error]', data.type, data.details, data.fatal);
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            if (retryCount < MAX_RETRIES) {
              retryCount++;
              console.log(`Network error — retry ${retryCount}/${MAX_RETRIES}`);
              setTimeout(() => hls && hls.startLoad(), 1500 * retryCount);
            } else {
              onStreamError('Stream unavailable — this channel may be offline or geo-restricted.');
            }
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.log('Media error — attempting recovery');
            hls.recoverMediaError();
            break;
          default:
            onStreamError('Stream error — try a different channel.');
            break;
        }
      }
    });

  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari native HLS
    video.src = streamUrl;
    video.addEventListener('loadedmetadata', playVideo, { once: true });
    video.addEventListener('error', () => onStreamError('Stream unavailable.'), { once: true });
  } else {
    onStreamError('HLS streams are not supported in this browser.');
  }
}

function playVideo() {
  video.volume = parseInt(volSlider.value, 10) / 100;
  video.muted  = isMuted;
  video.play().then(() => {
    isPlaying = true;
    setPlayState(true);
    showBuffering(false);
    // Briefly show controls then auto-hide so user knows they exist
    showControls();
  }).catch(() => {
    // Autoplay policy — try muted
    video.muted = true;
    video.play().then(() => {
      isPlaying = true; isMuted = true;
      setPlayState(true);
      setMuteState(true);
      showBuffering(false);
      showControls();
    }).catch(() => {
      showBuffering(false);
    });
  });
}

/* ─── Video Events ─── */
video.addEventListener('waiting', () => showBuffering(true));
video.addEventListener('playing', () => showBuffering(false));
video.addEventListener('pause',   () => { isPlaying = false; setPlayState(false); });
video.addEventListener('play',    () => { isPlaying = true;  setPlayState(true);  });
video.addEventListener('stalled', () => showBuffering(true));

/* ─── Controls Visibility ─── */
let lastMouseX = -1;
let lastMouseY = -1;

function showControls() {
  controlsEl.classList.add('visible');
  clearTimeout(controlsTimer);
  controlsTimer = setTimeout(hideControls, 2500);
}

function hideControls() {
  if (!video.paused) {
    controlsEl.classList.remove('visible');
  }
}

// Only trigger on real movement (ignore sub-pixel jitter)
function handleMouseMove(e) {
  const dx = Math.abs(e.clientX - lastMouseX);
  const dy = Math.abs(e.clientY - lastMouseY);
  if (dx > 2 || dy > 2) {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    showControls();
  }
}

wrapper.addEventListener('mousemove',  handleMouseMove, { passive: true });
wrapper.addEventListener('touchstart', showControls,    { passive: true });
wrapper.addEventListener('mouseleave', () => {
  clearTimeout(controlsTimer);
  controlsTimer = setTimeout(hideControls, 800);
});
// Show controls when paused, keep them until play resumes
video.addEventListener('pause', showControls);

/* ─── Play / Pause ─── */
function togglePlay() {
  if (video.paused) { video.play(); } else { video.pause(); }
  showControls();
}

function setPlayState(playing) {
  [playPauseBtn, centerPlayBtn].forEach(btn => {
    btn.querySelector('.icon-play').classList.toggle('hidden', playing);
    btn.querySelector('.icon-pause').classList.toggle('hidden', !playing);
  });
}

playPauseBtn.addEventListener('click',  togglePlay);
centerPlayBtn.addEventListener('click', togglePlay);

wrapper.addEventListener('click', (e) => {
  if (e.target === video || e.target === wrapper) togglePlay();
});

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  switch (e.key) {
    case ' ': case 'k': e.preventDefault(); togglePlay();           break;
    case 'f': case 'F': toggleFullscreen();                         break;
    case 'm': case 'M': toggleMute();                               break;
    case 'ArrowUp':     e.preventDefault(); adjustVolume(0.1);      break;
    case 'ArrowDown':   e.preventDefault(); adjustVolume(-0.1);     break;
  }
});

/* ─── Volume ─── */
volSlider.addEventListener('input', () => {
  const val = parseInt(volSlider.value, 10) / 100;
  video.volume = val;
  isMuted = val === 0;
  video.muted = isMuted;
  setMuteState(isMuted);
  showControls();
});

function adjustVolume(delta) {
  const newVol = Math.min(1, Math.max(0, video.volume + delta));
  video.volume    = newVol;
  volSlider.value = Math.round(newVol * 100);
  isMuted = newVol === 0;
  video.muted = isMuted;
  setMuteState(isMuted);
  showControls();
}

function toggleMute() {
  isMuted = !isMuted;
  video.muted = isMuted;
  if (!isMuted && video.volume === 0) { video.volume = 0.5; volSlider.value = 50; }
  setMuteState(isMuted);
  showControls();
}

function setMuteState(muted) {
  muteBtn.querySelector('.icon-vol').classList.toggle('hidden', muted);
  muteBtn.querySelector('.icon-muted').classList.toggle('hidden', !muted);
}

muteBtn.addEventListener('click', toggleMute);

/* ─── Fullscreen ─── */
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    wrapper.requestFullscreen().catch(console.warn);
  } else {
    document.exitFullscreen().catch(console.warn);
  }
  showControls();
}

document.addEventListener('fullscreenchange', () => {
  isFullscreen = !!document.fullscreenElement;
  fsBtn.querySelector('.icon-fullscreen').classList.toggle('hidden', isFullscreen);
  fsBtn.querySelector('.icon-exit-fullscreen').classList.toggle('hidden', !isFullscreen);
});

fsBtn.addEventListener('click', toggleFullscreen);

/* ─── Buffering / Error States ─── */
function showBuffering(show) { bufferingEl.classList.toggle('hidden', !show); }

function onStreamError(msg) {
  showBuffering(false);
  showStreamError(true, msg);
}

function showStreamError(show, msg = '') {
  errorEl.classList.toggle('hidden', !show);
  if (show && msg) errorMsg.textContent = msg;
}

retryStreamBtn.addEventListener('click', () => {
  if (currentChannel) { retryCount = 0; showStreamError(false); loadChannel(currentChannel); }
});

/* ─── M3U Parser ─── */
function parseM3U(text) {
  const lines    = text.split('\n').map(l => l.trim()).filter(Boolean);
  const channels = [];
  let current    = null;

  for (const line of lines) {
    if (line.startsWith('#EXTINF')) {
      const name    = (line.match(/,(.+)$/)            || [])[1]?.trim() || '';
      const logo    = (line.match(/tvg-logo="([^"]*)"/) || [])[1]?.trim() || '';
      const group   = (line.match(/group-title="([^"]*)"/) || [])[1]?.trim() || 'General';
      const tvgName = (line.match(/tvg-name="([^"]*)"/) || [])[1]?.trim() || '';
      current = { name: name || tvgName || 'Unknown', logo, group, url: '' };
    } else if (current && !line.startsWith('#')) {
      current.url = line;
      channels.push(current);
      current = null;
    }
  }
  return channels;
}

function normaliseGroup(g) {
  if (!g || g === '' || g === 'undefined') return 'General';
  return g.split('/').map(s => s.trim()).filter(Boolean)[0] || 'General';
}

/* ─── Fetch All Channels (sidebar) ─── */
async function fetchAllChannels() {
  const urls = [
    LOCAL_WORKING,
    LOCAL_PROXY  + encodeURIComponent(PLAYLIST_URL),
    REMOTE_PROXY + encodeURIComponent(PLAYLIST_URL),
    PLAYLIST_URL,
  ];

  let text = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'default' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
      if (text.includes('#EXTINF')) break;
      text = null;
    } catch (e) {
      console.warn('Sidebar fetch failed:', e.message);
    }
  }

  if (!text) {
    sidebarList.innerHTML = `<div class="sidebar-loading"><span>⚠ Could not load channel list</span></div>`;
    return;
  }

  let channels = parseM3U(text);
  channels     = channels.map(ch => ({ ...ch, group: normaliseGroup(ch.group) }));
  channels.sort((a, b) => a.name.localeCompare(b.name));
  allChannels = channels;

  const groups = [...new Set(channels.map(c => c.group))].sort();
  buildSidebarTabs(groups);
  renderSidebar(channels);
}

/* ─── Sidebar Tabs ─── */
function buildSidebarTabs(groups) {
  sidebarTabs.innerHTML = `<button class="sidebar-tab active" data-cat="all" role="tab">All</button>`;
  groups.forEach(g => {
    const btn = document.createElement('button');
    btn.className   = 'sidebar-tab';
    btn.dataset.cat = g;
    btn.role        = 'tab';
    btn.textContent = g;
    sidebarTabs.appendChild(btn);
  });

  sidebarTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.sidebar-tab');
    if (!tab) return;
    sidebarFilter = tab.dataset.cat;
    sidebarTabs.querySelectorAll('.sidebar-tab').forEach(t => t.classList.toggle('active', t === tab));
    renderSidebar(filterSidebar());
  });
}

function filterSidebar() {
  let list = allChannels;
  if (sidebarFilter !== 'all') list = list.filter(c => c.group === sidebarFilter);
  if (sidebarSearch) {
    const q = sidebarSearch.toLowerCase();
    list = list.filter(c => c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
  }
  return list;
}

/* ─── Render Sidebar ─── */
function renderSidebar(channels) {
  sidebarList.innerHTML = '';
  if (channels.length === 0) {
    sidebarList.innerHTML = `<div class="sidebar-loading"><span>No channels found</span></div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  channels.forEach(ch => frag.appendChild(buildSidebarItem(ch)));
  sidebarList.appendChild(frag);
  if (currentChannel) highlightSidebarItem(currentChannel);
}

function buildSidebarItem(channel) {
  const item = document.createElement('div');
  item.className   = 'sidebar-item';
  item.dataset.url = channel.url;

  const fbClass  = FALLBACK_CLASS(channel.group);
  const initials = getInitials(channel.name);

  item.innerHTML = `
    <div class="sidebar-item-logo">
      ${channel.logo
        ? `<img src="${escapeHtml(channel.logo)}" alt="" loading="lazy"
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
           <div class="sidebar-item-fallback ${fbClass}" style="display:none">${initials}</div>`
        : `<div class="sidebar-item-fallback ${fbClass}">${initials}</div>`
      }
    </div>
    <div class="sidebar-item-info">
      <div class="sidebar-item-name">${escapeHtml(channel.name)}</div>
      <div class="sidebar-item-cat">${escapeHtml(channel.group)}</div>
    </div>
  `;

  item.addEventListener('click', () => loadChannel(channel));
  return item;
}

function highlightSidebarItem(channel) {
  sidebarList.querySelectorAll('.sidebar-item').forEach(el => {
    el.classList.toggle('active', el.dataset.url === channel.url);
  });
}

sidebarSearchEl.addEventListener('input', (e) => {
  sidebarSearch = e.target.value.trim();
  renderSidebar(filterSidebar());
});

/* ─── Boot ─── */
async function init() {
  // Check if local proxy is up
  await checkProxy();
  console.log(`[IndiaStream] Local proxy available: ${proxyAvailable}`);

  const params = getParams();

  if (params.url) {
    loadChannel({ url: params.url, name: params.name, logo: params.logo, group: params.group });
  } else {
    onStreamError('No channel selected. Go back and pick a channel.');
  }

  await fetchAllChannels();
  if (currentChannel) highlightSidebarItem(currentChannel);
}

init();
