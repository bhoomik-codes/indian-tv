/* ============================================================
   IndiaStream — Homepage JS
   Fetches India M3U playlist, parses channels, builds Netflix UI
   ============================================================ */

// All URLs & ports come from js/config.js — edit that file to reconfigure.
const PLAYLIST_URL  = CONFIG_PLAYLIST_URL;
const LOCAL_WORKING = CONFIG_LOCAL_WORKING;
const LOCAL_PROXY   = CONFIG_LOCAL_PROXY;
const REMOTE_PROXY  = CONFIG_REMOTE_PROXY;

// Proxy a URL through the local proxy server
function proxyUrl(url) {
  return LOCAL_PROXY + encodeURIComponent(url);
}

let allChannels    = [];
let filteredChannels = [];
let activeFilter   = 'all';
let searchQuery    = '';

/* ─── Category Config ─── */
const CATEGORY_ICONS = {
  'News':          '📰',
  'Entertainment': '🎭',
  'Movies':        '🎬',
  'Sports':        '⚽',
  'Music':         '🎵',
  'Kids':          '🧸',
  'Religious':     '🛕',
  'General':       '📺',
  'Documentary':   '🎥',
  'Cooking':       '🍳',
  'Education':     '📚',
  'Business':      '💼',
  'Lifestyle':     '🌿',
  'Travel':        '✈️',
  'Weather':       '🌤️',
  'undefined':     '📺',
};

const CAT_CLASS = (cat) => {
  const key = (cat || 'default').toLowerCase();
  const map = {
    news: 'news', entertainment: 'entertainment', movies: 'movies',
    sports: 'sports', music: 'music', kids: 'kids', religious: 'religious',
    general: 'general', undefined: 'undefined',
  };
  return 'cat-' + (map[key] || 'default');
};

const FALLBACK_CLASS = (cat) => {
  const key = (cat || 'default').toLowerCase();
  const map = {
    news: 'news', entertainment: 'entertainment', movies: 'movies',
    sports: 'sports', music: 'music', kids: 'kids', religious: 'religious',
    general: 'general',
  };
  return 'fallback-' + (map[key] || 'default');
};

/* ─── M3U Parser ─── */
function parseM3U(text) {
  const lines   = text.split('\n').map(l => l.trim()).filter(Boolean);
  const channels = [];
  let current   = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#EXTINF')) {
      const name     = extractAttr(line, null, /,(.+)$/);
      const logo     = extractAttr(line, 'tvg-logo');
      const group    = extractAttr(line, 'group-title') || 'General';
      const tvgName  = extractAttr(line, 'tvg-name');
      const tvgId    = extractAttr(line, 'tvg-id');
      current = { name: name || tvgName || 'Unknown', logo, group, tvgId, url: '' };
    } else if (current && !line.startsWith('#')) {
      current.url = line;
      channels.push(current);
      current = null;
    }
  }
  return channels;
}

function extractAttr(line, attr, regex) {
  if (attr) {
    const match = line.match(new RegExp(`${attr}="([^"]*)"`));
    return match ? match[1].trim() : '';
  }
  if (regex) {
    const match = line.match(regex);
    return match ? match[1].trim() : '';
  }
  return '';
}

/* ─── Normalise group names ─── */
function normaliseGroup(g) {
  if (!g || g === '' || g === 'undefined') return 'General';
  return g.split('/').map(s => s.trim()).filter(Boolean)[0] || 'General';
}

/* ─── Fetch & Init ─── */
async function fetchChannels() {
  showLoading(true);
  showError(false);

  // Priority: local working.m3u → local proxy → remote CORS proxy → direct
  const urls = [
    LOCAL_WORKING,
    LOCAL_PROXY  + encodeURIComponent(PLAYLIST_URL),
    REMOTE_PROXY + encodeURIComponent(PLAYLIST_URL),
    PLAYLIST_URL,
  ];

  let text = null;
  const labels = ['Loading verified channels...', 'Connecting to local proxy...', 'Trying remote CORS proxy...', 'Trying direct fetch...'];

  for (let i = 0; i < urls.length; i++) {
    try {
      document.getElementById('loading-sub').textContent = labels[i];
      const res = await fetch(urls[i], { cache: 'default' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
      if (text.includes('#EXTINF')) break;
      text = null;
    } catch (e) {
      console.warn('Fetch failed for', urls[i], e.message);
    }
  }

  if (!text) {
    showLoading(false);
    showError(true, 'Could not load the channel list. Make sure the proxy is running: python3 proxy.py');
    return;
  }

  let channels = parseM3U(text);
  channels = channels.map(ch => ({ ...ch, group: normaliseGroup(ch.group) }));

  // Sort alphabetically within groups
  channels.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));

  allChannels = channels;
  filteredChannels = channels;

  // Update stats
  const groups = [...new Set(channels.map(c => c.group))];
  document.getElementById('stat-channels').textContent   = channels.length;
  document.getElementById('stat-categories').textContent = groups.length;

  // Hero pick - first channel
  if (channels.length > 0) {
    const featured = channels.find(c => c.logo) || channels[0];
    document.getElementById('hero-title').textContent = 'Live Indian TV';
    document.getElementById('hero-watch-btn').addEventListener('click', () => openChannel(featured));
  }

  showLoading(false);
  buildNavLinks(groups);
  renderRows(channels);
}

/* ─── Build Category Nav ─── */
function buildNavLinks(groups) {
  const common = ['News', 'Entertainment', 'Movies', 'Sports', 'Music', 'Kids'];
  const navLinks = document.getElementById('nav-links');
  // Clear existing dynamic links, keep "All"
  navLinks.innerHTML = `<li><a href="#" class="nav-link ${activeFilter === 'all' ? 'active' : ''}" data-filter="all" id="filter-all">All Channels</a></li>`;

  const shown = common.filter(c => groups.some(g => g.toLowerCase() === c.toLowerCase()));
  shown.forEach(cat => {
    const actual = groups.find(g => g.toLowerCase() === cat.toLowerCase()) || cat;
    const li = document.createElement('li');
    li.innerHTML = `<a href="#" class="nav-link" data-filter="${actual}">${cat}</a>`;
    navLinks.appendChild(li);
  });

  // Event delegation
  navLinks.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const filter = link.dataset.filter;
      setFilter(filter);
    });
  });
}

function setFilter(filter) {
  activeFilter = filter;
  // Update active state
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.filter === filter);
  });
  // Filter and re-render
  if (filter === 'all') {
    filteredChannels = allChannels;
  } else {
    filteredChannels = allChannels.filter(c => c.group === filter);
  }
  renderRows(applySearch(filteredChannels, searchQuery));
  document.getElementById('main-content').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function applySearch(channels, query) {
  if (!query) return channels;
  const q = query.toLowerCase();
  return channels.filter(c => c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
}

/* ─── Render Channel Rows ─── */
const PREVIEW_COUNT = 12; // channels per row before "see all"

function renderRows(channels) {
  const container = document.getElementById('channel-rows');
  container.innerHTML = '';

  if (channels.length === 0) {
    container.innerHTML = `
      <div class="error-container" style="min-height:30vh">
        <div class="error-icon">📺</div>
        <h2 class="error-title">No Channels Found</h2>
        <p class="error-msg">Try a different search term or category.</p>
      </div>`;
    return;
  }

  // Group by category
  const groups = {};
  channels.forEach(ch => {
    if (!groups[ch.group]) groups[ch.group] = [];
    groups[ch.group].push(ch);
  });

  // Sort groups: put General last
  const sortedGroups = Object.keys(groups).sort((a, b) => {
    if (a === 'General') return 1;
    if (b === 'General') return -1;
    return a.localeCompare(b);
  });

  sortedGroups.forEach((group, idx) => {
    const chs = groups[group];
    const row = buildRow(group, chs, idx);
    container.appendChild(row);
  });
}

function buildRow(group, channels, idx) {
  const row = document.createElement('section');
  row.className = 'channel-row';
  row.style.animationDelay = `${idx * 60}ms`;

  const icon = CATEGORY_ICONS[group] || '📺';
  const preview = channels.slice(0, PREVIEW_COUNT);
  const hasMore = channels.length > PREVIEW_COUNT;
  let expanded = false;

  row.innerHTML = `
    <div class="row-header">
      <h2 class="row-title">
        ${icon} ${group}
        <span class="row-count">${channels.length} channels</span>
      </h2>
      ${hasMore ? `<button class="row-see-all" data-group="${group}">See all</button>` : ''}
    </div>
    <div class="channel-grid" id="grid-${sanitiseId(group)}"></div>
  `;

  const grid = row.querySelector('.channel-grid');
  renderCards(grid, preview);

  if (hasMore) {
    const seeAll = row.querySelector('.row-see-all');
    seeAll.addEventListener('click', () => {
      expanded = !expanded;
      renderCards(grid, expanded ? channels : preview);
      seeAll.textContent = expanded ? 'Show less' : 'See all';
    });
  }

  return row;
}

function sanitiseId(str) {
  return str.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

function renderCards(grid, channels) {
  grid.innerHTML = '';
  channels.forEach((ch, i) => {
    const card = buildCard(ch, i);
    grid.appendChild(card);
  });
}

function buildCard(channel, idx) {
  const card = document.createElement('div');
  card.className = 'channel-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `Watch ${channel.name}`);
  card.style.animationDelay = `${idx * 30}ms`;

  const catClass      = CAT_CLASS(channel.group);
  const fallbackClass = FALLBACK_CLASS(channel.group);
  const initials      = getInitials(channel.name);

  card.innerHTML = `
    <div class="card-overlay">
      <div class="card-play-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      </div>
    </div>
    <div class="card-logo-wrap">
      ${channel.logo
        ? `<img src="${escapeHtml(channel.logo)}" alt="${escapeHtml(channel.name)}" loading="lazy"
               onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'" />
           <div class="card-logo-fallback ${fallbackClass}" style="display:none">${initials}</div>`
        : `<div class="card-logo-fallback ${fallbackClass}">${initials}</div>`
      }
    </div>
    <span class="card-name">${escapeHtml(channel.name)}</span>
    <span class="card-cat">${escapeHtml(channel.group)}</span>
  `;

  const handler = () => openChannel(channel);
  card.addEventListener('click', handler);
  card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } });

  return card;
}

function getInitials(name) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ─── Open Channel → Player ─── */
function openChannel(channel) {
  const params = new URLSearchParams({
    url:   channel.url,
    name:  channel.name,
    logo:  channel.logo  || '',
    group: channel.group || '',
  });
  window.location.href = `player.html?${params.toString()}`;
}

/* ─── UI Helpers ─── */
function showLoading(show) {
  document.getElementById('loading-container').style.display = show ? 'flex' : 'none';
  if (show) {
    document.getElementById('channel-rows').innerHTML = '';
  }
}

function showError(show, msg = '') {
  const el = document.getElementById('error-container');
  el.classList.toggle('hidden', !show);
  if (show && msg) document.getElementById('error-msg').textContent = msg;
}

/* ─── Navbar Scroll Shrink ─── */
window.addEventListener('scroll', () => {
  document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 80);
}, { passive: true });

/* ─── Search ─── */
document.getElementById('search-input').addEventListener('input', (e) => {
  searchQuery = e.target.value.trim();
  const results = applySearch(filteredChannels, searchQuery);
  renderRows(results);
});

/* ─── Hero Explore ─── */
document.getElementById('hero-explore-btn').addEventListener('click', () => {
  document.getElementById('main-content').scrollIntoView({ behavior: 'smooth' });
});

/* ─── Retry ─── */
document.getElementById('retry-btn').addEventListener('click', fetchChannels);

/* ─── Boot ─── */
fetchChannels();
