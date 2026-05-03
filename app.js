const subjects = {
  math:      { name: '数学', color: '#7c6fff' },
  physics:   { name: '物理', color: '#4ecdc4' },
  chemistry: { name: '化学', color: '#52c985' },
  biology:   { name: '生物', color: '#45c97a' },
  chinese:   { name: '语文', color: '#e87545' },
  english:   { name: '英语', color: '#4592e8' },
  history:   { name: '历史', color: '#c4944a' },
  geography: { name: '地理', color: '#7ac053' },
  politics:  { name: '政治', color: '#b06fbb' },
  other:     { name: '其他', color: '#9e8faa' }
};

// 渲染 Markdown + LaTeX 内容
function renderContent(text) {
  if (!text) return '';
  if (typeof marked === 'undefined') return escapeHtml(text);

  const mathBlocks = [];

  const protect = (str) => {
    let t = str;
    // Block math $$...$$
    t = t.replace(/\$\$([^$]+?)\$\$/gs, (_, m) => {
      const i = mathBlocks.length;
      try {
        mathBlocks.push(typeof katex !== 'undefined'
          ? katex.renderToString(m.trim(), { displayMode: true, throwOnError: false })
          : `<code>$$${escapeHtml(m)}$$</code>`);
      } catch { mathBlocks.push(`<code>$$${escapeHtml(m)}$$</code>`); }
      return `\x00M${i}\x00`;
    });
    // Inline math $...$
    t = t.replace(/\$([^$\n]+?)\$/g, (_, m) => {
      const i = mathBlocks.length;
      try {
        mathBlocks.push(typeof katex !== 'undefined'
          ? katex.renderToString(m.trim(), { displayMode: false, throwOnError: false })
          : `<code>$${escapeHtml(m)}$</code>`);
      } catch { mathBlocks.push(`<code>$${escapeHtml(m)}$</code>`); }
      return `\x00M${i}\x00`;
    });
    return t;
  };

  const restored = (html) =>
    html.replace(/\x00M(\d+)\x00/g, (_, i) => mathBlocks[+i] || '');

  const html = restored(marked.parse(protect(text)));
  return html;
}

let currentPage = 'index';
let cardState = {
  list: [],
  cursor: 0,
  flipped: false
};
let currentDetailId = null;
let graphAnim = null;
let graphSim = null;
let graphMistakes = [];
let graphFilterTag = '';

let vaultState = {
  view: 'table',
  search: '',
  subject: '',
  status: '',
  difficulty: '',
  tag: '',
  sort: 'createdAt-desc',
  data: []
};

function initTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const icon = document.querySelector('.theme-icon');
  if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function compressImage(file, callback, maxWidth = 800, quality = 0.6) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      callback(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function showToast(msg, duration = 1600) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), duration);
}

function showModal(title, content, confirmText = '确定', cancelText = '取消') {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">${title}</div>
        <div class="modal-content">${content}</div>
        <div class="modal-actions">
          <div class="btn btn-ghost modal-cancel">${cancelText}</div>
          <div class="btn btn-accent modal-confirm">${confirmText}</div>
        </div>
      </div>
    `;

    overlay.querySelector('.modal-cancel').onclick = () => {
      overlay.remove();
      resolve(false);
    };

    overlay.querySelector('.modal-confirm').onclick = () => {
      overlay.remove();
      resolve(true);
    };

    document.body.appendChild(overlay);
  });
}

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));

  const target = document.getElementById(`page-${page}`);
  if (target) {
    target.classList.add('active');
    currentPage = page;
  }

  const tab = document.querySelector(`.tab-item[data-page="${page}"]`);
  if (tab) tab.classList.add('active');

  if (page === 'index') refreshIndex();
  if (page === 'card') refreshCard();
  if (page === 'graph') refreshGraph();
  if (page === 'vault') refreshVault();
}

async function refreshIndex() {
  try {
    const [stats, dueList, recent] = await Promise.all([
      getStats(),
      listDueMistakes(20),
      listMistakes({}, 20)
    ]);

    document.getElementById('stat-total').textContent = stats.total;
    document.getElementById('stat-due').textContent = stats.due;
    document.getElementById('stat-mastered').textContent = stats.mastered;
    document.getElementById('due-count').textContent = `${dueList.length} cards`;

    const dueListEl = document.getElementById('due-list');
    if (dueList.length === 0) {
      dueListEl.innerHTML = `
        <div class="due-empty">
          <span class="emoji">✨</span>
          <span>太棒了，今天没有待复习的题</span>
        </div>
      `;
    } else {
      dueListEl.innerHTML = dueList.map(m => `
        <div class="due-card" data-id="${m._id}">
          <div class="due-bar bar-${m.subject}"></div>
          <div class="due-body">
            <div class="due-meta">
              <span class="tag tag-${m.subject}">${subjects[m.subject].name}</span>
              <span class="due-count">×${m.errorCount || 1}</span>
            </div>
            <span class="due-title serif md-rendered">${renderContent(m.title || m.content)}</span>
            <div class="due-foot">
              <div class="dots">
                ${[1,2,3].map(d => `<div class="dot ${d <= m.difficulty ? 'on' : ''}"></div>`).join('')}
              </div>
              <span class="due-tag mono">${m.tags?.[0] || ''}</span>
            </div>
          </div>
        </div>
      `).join('');

      dueListEl.querySelectorAll('.due-card').forEach(card => {
        card.onclick = () => openCard(card.dataset.id);
      });
    }

    const recentEl = document.getElementById('recent-list');
    if (recent.length === 0) {
      recentEl.innerHTML = `
        <div class="empty">
          <span class="empty-emoji">📓</span>
          <span class="empty-title">还没有错题</span>
          <span class="empty-sub">点右上的「+ 新增」开始记录</span>
        </div>
      `;
    } else {
      recentEl.innerHTML = recent.map(m => {
        const dateStr = formatDate(m.createdAt).slice(5);
        return `
          <div class="recent-item" data-id="${m._id}">
            <div class="recent-icon icon-${m.subject}">
              <span>${subjects[m.subject].name[0]}</span>
            </div>
            <div class="recent-main">
              <div class="recent-row1">
                <span class="recent-title md-rendered">${renderContent(m.title || m.content)}</span>
              </div>
              <div class="recent-row2">
                <span class="tag tag-${m.subject}">${subjects[m.subject].name}</span>
                ${m.tags?.[0] ? `<span class="recent-topic">#${m.tags[0]}</span>` : ''}
              </div>
            </div>
            <div class="recent-meta">
              <div class="badge">×${m.errorCount || 1}</div>
              <span class="recent-date mono">${dateStr}</span>
            </div>
          </div>
        `;
      }).join('');

      recentEl.querySelectorAll('.recent-item').forEach(item => {
        item.onclick = () => openDetail(item.dataset.id);
      });
    }
  } catch (err) {
    console.error('refresh index fail', err);
  }
}

function openCard(id) {
  cardState.list = [];  // 空列表，updateCardCurrent 会直接 showCardEmpty
  cardState.cursor = 0;
  cardState.flipped = false;
  navigateTo('card');
  loadCardSingle(id);  // 回来后再填充
}

function openDetail(id) {
  currentDetailId = id;
  navigateTo('detail');
  loadDetail(id);
}

async function refreshCard() {
  if (cardState.list.length === 0) {
    await loadDue();
  } else {
    updateCardCurrent();
  }
}

async function loadDue() {
  try {
    const list = await listDueMistakes(50);
    cardState.list = list;
    cardState.cursor = 0;
    cardState.flipped = false;
    updateCardCurrent();
  } catch {
    cardState.list = [];
    showCardEmpty();
  }
}

async function loadCardSingle(id) {
  try {
    const m = await getMistake(id);
    if (m) {
      cardState.list = [m];
      cardState.cursor = 0;
      cardState.flipped = false;
      updateCardCurrent();
    }
  } catch {
    showToast('加载失败');
  }
}

function updateCardCurrent() {
  const { list, cursor } = cardState;
  const total = list.length;

  if (cursor >= total || total === 0) {
    showCardEmpty();
    return;
  }

  const current = list[cursor];
  document.getElementById('card-content').style.display = 'block';
  document.getElementById('card-empty').style.display = 'none';

  document.getElementById('card-progress-text').textContent = `${cursor + 1} / ${total}`;
  document.getElementById('card-progress-fill').style.width = `${Math.round(((cursor + 1) / total) * 100)}%`;

  cardState.flipped = false;
  document.getElementById('flip-card').classList.remove('is-flipped');

  document.getElementById('card-subject-tag').textContent = subjects[current.subject]?.name || '其他';
  document.getElementById('card-subject-tag').className = `tag tag-${current.subject}`;
  document.getElementById('card-subject-tag-back').textContent = subjects[current.subject]?.name || '其他';
  document.getElementById('card-subject-tag-back').className = `tag tag-${current.subject}`;

  document.getElementById('card-difficulty-dots').innerHTML = [1,2,3].map(d =>
    `<div class="dot ${d <= current.difficulty ? 'on' : ''}"></div>`
  ).join('');

  const qEl = document.getElementById('card-question');
  qEl.innerHTML = renderContent(current.title || current.content);
  qEl.classList.add('md-rendered');
  const subEl = document.getElementById('card-question-sub');
  if (current.title && current.content && current.content !== current.title) {
    subEl.innerHTML = renderContent(current.content);
    subEl.classList.add('md-rendered');
    subEl.style.display = 'block';
  } else {
    subEl.style.display = 'none';
  }

  const noteEl = document.getElementById('card-note');
  const errorBox = document.getElementById('card-error-box');
  const backBody = document.getElementById('card-back-body');
  const oldEmpty = backBody.querySelector('.back-empty');
  if (oldEmpty) oldEmpty.remove();
  if (current.note) {
    noteEl.innerHTML = renderContent(current.note);
    noteEl.classList.add('md-rendered');
    noteEl.style.display = 'block';
  } else {
    noteEl.style.display = 'none';
    const emptySpan = document.createElement('span');
    emptySpan.className = 'back-empty';
    emptySpan.textContent = '暂无解析，记得补充哦';
    backBody.insertBefore(emptySpan, errorBox);
  }

  if (current.errorReason) {
    errorBox.style.display = 'flex';
    document.getElementById('card-error-reason').innerHTML = renderContent(current.errorReason);
  } else {
    errorBox.style.display = 'none';
  }

  const rateButtons = document.getElementById('rate-buttons');
  rateButtons.classList.toggle('rate-locked', !cardState.flipped);

  document.getElementById('meta-subject').textContent = subjects[current.subject]?.name || '其他';
  document.getElementById('meta-difficulty').textContent = `${current.difficulty} / 3`;
  document.getElementById('meta-error-count').textContent = current.errorCount || 1;

  const tagsRow = document.getElementById('meta-tags-row');
  if (current.tags?.length) {
    tagsRow.style.display = 'flex';
    document.getElementById('meta-tags').innerHTML = current.tags.map(t =>
      `<span class="meta-tag">#${t}</span>`
    ).join('');
  } else {
    tagsRow.style.display = 'none';
  }

  document.getElementById('meta-last-reviewed').textContent = current.lastReviewed ? formatDate(current.lastReviewed) : '从未';
  document.getElementById('meta-next-review').textContent = current.nextReview ? formatDate(current.nextReview) : '—';

  // 显示 SM-2 预计复习间隔
  const preview = previewSRSIntervals(current);
  const easyBtn  = document.querySelector('.rate-btn.rate-easy  .rate-sub');
  const midBtn   = document.querySelector('.rate-btn.rate-medium .rate-sub');
  const hardBtn  = document.querySelector('.rate-btn.rate-hard  .rate-sub');
  if (easyBtn)  easyBtn.textContent  = formatInterval(preview.easy.interval);
  if (midBtn)   midBtn.textContent   = formatInterval(preview.medium.interval);
  if (hardBtn)  hardBtn.textContent  = formatInterval(preview.hard.interval);
}

function showCardEmpty() {
  document.getElementById('card-content').style.display = 'none';
  document.getElementById('card-empty').style.display = 'flex';
}

async function rateCard(rating) {
  if (!cardState.flipped) return;

  const { list, cursor } = cardState;
  const m = list[cursor];
  if (!m) return;

  const fullM = await getMistake(m._id);
  if (!fullM) return;

  const newErrorCount = rating === 'hard' ? (fullM.errorCount || 1) + 1 : (fullM.errorCount || 1);
  const srs = computeNextSRS(rating, fullM);
  const mastered = rating === 'easy' && (fullM.repetitions || 0) >= 4;

  try {
    await Promise.all([
      addReview(fullM._id, rating),
      updateMistake(fullM._id, {
        errorCount: newErrorCount,
        nextReview: srs.nextReview,
        interval: srs.interval,
        easeFactor: srs.easeFactor,
        repetitions: srs.repetitions,
        lastReviewed: new Date().toISOString(),
        mastered
      })
    ]);
  } catch (err) {
    console.error(err);
    showToast('保存评分失败');
  }

  const msg = formatInterval(srs.interval) + ' 再见';
  showToast(msg);

  cardState.cursor++;
  cardState.flipped = false;
  updateCardCurrent();
}

async function refreshGraph() {
  let mistakes = [];
  try {
    mistakes = await listMistakes({}, 500);
  } catch {
    mistakes = [];
  }

  graphMistakes = mistakes;

  const tagMap = {};
  const edgeMap = {};

  mistakes.forEach(m => {
    const tags = (m.tags || []).filter(Boolean);
    tags.forEach(t => {
      if (!tagMap[t]) tagMap[t] = { count: 0, subjects: {}, mistakes: [] };
      tagMap[t].count++;
      tagMap[t].mistakes.push(m._id);
      tagMap[t].subjects[m.subject] = (tagMap[t].subjects[m.subject] || 0) + 1;
    });
    for (let i = 0; i < tags.length; i++) {
      for (let j = i + 1; j < tags.length; j++) {
        const key = [tags[i], tags[j]].sort().join('|');
        edgeMap[key] = (edgeMap[key] || 0) + 1;
      }
    }
  });

  const dominantSubject = (subjMap) => {
    let best = 'other', bestCount = -1;
    Object.keys(subjMap).forEach(s => {
      if (subjMap[s] > bestCount) { best = s; bestCount = subjMap[s]; }
    });
    return best;
  };

  const tags = Object.keys(tagMap);
  const maxCount = Math.max(1, ...tags.map(t => tagMap[t].count));

  document.getElementById('graph-stats').textContent = `${mistakes.length} 个错题 · ${tags.length} 个知识点 · ${Object.keys(edgeMap).length} 条连线`;
  document.getElementById('graph-empty').style.display = tags.length === 0 ? 'flex' : 'none';

  initForceGraph(tags, tagMap, edgeMap, dominantSubject, maxCount);
}

function initForceGraph(tags, tagMap, edgeMap, dominantSubject, maxCount) {
  const canvas = document.getElementById('graphCanvas');
  const wrap = document.getElementById('graph-wrap');
  const tooltip = document.getElementById('graph-tooltip');
  const ctx = canvas.getContext('2d');

  if (graphAnim) cancelAnimationFrame(graphAnim);
  if (graphSim && graphSim.cleanup) graphSim.cleanup();

  const SUBJECT_COLORS = {
    math: '#7c6fff',
    physics: '#4ecdc4',
    chemistry: '#52c985',
    biology: '#45c97a',
    chinese: '#e87545',
    english: '#4592e8',
    history: '#c4944a',
    geography: '#7ac053',
    politics: '#b06fbb',
    other: '#9e8faa'
  };

  let dpr = window.devicePixelRatio || 1;
  let W = 0, H = 0;

  function fitCanvas() {
    const rect = wrap.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fitCanvas();

  // 黄金角螺旋初始布局，避免初始堆叠
  const GOLDEN = 2.399963;
  const initR = Math.min(W, H) * 0.38;
  const nodes = tags.map((t, i) => {
    const subj = dominantSubject(tagMap[t].subjects);
    const r = 6 + (tagMap[t].count / maxCount) * 18;
    const angle = i * GOLDEN;
    const dist = initR * Math.sqrt((i + 0.5) / Math.max(tags.length, 1));
    return {
      id: t,
      count: tagMap[t].count,
      subject: subj,
      mistakes: tagMap[t].mistakes,
      r,
      x: W / 2 + Math.cos(angle) * dist,
      y: H / 2 + Math.sin(angle) * dist,
      vx: 0,
      vy: 0,
      pinned: false
    };
  });
  const idx = {};
  nodes.forEach((n, i) => { idx[n.id] = i; });

  const links = Object.keys(edgeMap)
    .map(k => {
      const [a, b] = k.split('|');
      if (idx[a] === undefined || idx[b] === undefined) return null;
      return { source: idx[a], target: idx[b], weight: edgeMap[k] };
    })
    .filter(Boolean);

  const neighbors = {};
  nodes.forEach(n => { neighbors[n.id] = new Set([n.id]); });
  links.forEach(l => {
    neighbors[nodes[l.source].id].add(nodes[l.target].id);
    neighbors[nodes[l.target].id].add(nodes[l.source].id);
  });

  const REPEL = 1800;
  const LINK_DIST = 110;
  const LINK_STRENGTH = 0.04;
  const CENTER_STRENGTH = 0.004;
  const FRICTION = 0.78;
  const COLLIDE_PAD = 8;
  const MAX_VEL = 12;
  let alpha = 1;
  const ALPHA_DECAY = 0.0022;
  const ALPHA_MIN = 0.003;

  let scale = 1;
  let panX = 0, panY = 0;
  let hoverNode = null;
  let dragNode = null;
  let isPanning = false;
  let panStart = null;
  let pointerDownPos = null;

  function reheat() { alpha = Math.max(alpha, 0.6); }

  function step() {
    if (alpha <= ALPHA_MIN && !dragNode) return;
    alpha = Math.max(ALPHA_MIN, alpha - ALPHA_DECAY);
    // 拖拽中清零被动加速，防止松手弹射
    if (dragNode) { dragNode.vx = 0; dragNode.vy = 0; }

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) {
          dx = (Math.random() - 0.5) * 0.5;
          dy = (Math.random() - 0.5) * 0.5;
          d2 = dx * dx + dy * dy + 0.01;
        }
        const d = Math.sqrt(d2);
        const f = (REPEL / d2) * alpha;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;

        const minD = a.r + b.r + COLLIDE_PAD;
        if (d < minD) {
          const overlap = (minD - d) * 0.5;
          a.vx -= (dx / d) * overlap;
          a.vy -= (dy / d) * overlap;
          b.vx += (dx / d) * overlap;
          b.vy += (dy / d) * overlap;
        }
      }
    }

    links.forEach(l => {
      const a = nodes[l.source];
      const b = nodes[l.target];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const target = LINK_DIST + 30 / Math.sqrt(l.weight);
      const force = (d - target) * LINK_STRENGTH * alpha;
      const fx = (dx / d) * force;
      const fy = (dy / d) * force;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    });

    nodes.forEach(n => {
      n.vx += (W / 2 - n.x) * CENTER_STRENGTH * alpha;
      n.vy += (H / 2 - n.y) * CENTER_STRENGTH * alpha;
    });

    nodes.forEach(n => {
      if (n === dragNode) return;
      n.vx *= FRICTION;
      n.vy *= FRICTION;
      n.vx = Math.max(-MAX_VEL, Math.min(MAX_VEL, n.vx));
      n.vy = Math.max(-MAX_VEL, Math.min(MAX_VEL, n.vy));
      n.x += n.vx;
      n.y += n.vy;
    });
  }

  function colorRGBA(hex, a) {
    const m = hex.match(/^#([0-9a-f]{6})$/i);
    if (!m) return hex;
    const v = parseInt(m[1], 16);
    return `rgba(${(v >> 16) & 0xff},${(v >> 8) & 0xff},${v & 0xff},${a})`;
  }

  function isDimmed(n) {
    if (!hoverNode) return false;
    return !neighbors[hoverNode.id].has(n.id);
  }

  function isLinkDim(l) {
    if (!hoverNode) return false;
    return nodes[l.source].id !== hoverNode.id && nodes[l.target].id !== hoverNode.id;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(scale, scale);

    ctx.lineCap = 'round';
    links.forEach(l => {
      const a = nodes[l.source];
      const b = nodes[l.target];
      const dim = isLinkDim(l);
      const colA = SUBJECT_COLORS[a.subject] || '#c8a96e';
      const colB = SUBJECT_COLORS[b.subject] || '#c8a96e';
      const baseAlpha = dim ? 0.06 : 0.4;
      const lg = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      lg.addColorStop(0, colorRGBA(colA, baseAlpha));
      lg.addColorStop(1, colorRGBA(colB, baseAlpha));
      ctx.strokeStyle = lg;
      ctx.lineWidth = Math.min(3, 0.6 + l.weight * 0.5) / Math.max(0.6, scale);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });

    nodes.forEach(n => {
      const dim = isDimmed(n);
      const isHover = hoverNode && hoverNode.id === n.id;
      const color = SUBJECT_COLORS[n.subject] || '#c8a96e';
      const a = dim ? 0.18 : 1;

      if (isHover || (!dim && hoverNode && neighbors[hoverNode.id].has(n.id))) {
        const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 3);
        glow.addColorStop(0, colorRGBA(color, 0.45));
        glow.addColorStop(1, colorRGBA(color, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = colorRGBA(color, a);
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();

      if (isHover) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 / Math.max(0.6, scale);
        ctx.stroke();
      }

      const showLabel = isHover ||
        (hoverNode && neighbors[hoverNode.id].has(n.id)) ||
        (!hoverNode && (scale > 0.85 || n.r > 12));
      if (showLabel) {
        const labelAlpha = dim ? 0.25 : 0.92;
        ctx.fillStyle = `rgba(232, 228, 220, ${labelAlpha})`;
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (!isDark) ctx.fillStyle = `rgba(45, 38, 50, ${labelAlpha})`;
        const fs = Math.max(10, Math.min(13, 11 / Math.max(0.7, scale)));
        ctx.font = `500 ${fs}px -apple-system, "PingFang SC", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(n.id, n.x, n.y + n.r + 3);
      }
    });

    ctx.restore();
  }

  function loop() {
    step();
    draw();
    graphAnim = requestAnimationFrame(loop);
  }

  function clientToWorld(cx, cy) {
    const rect = canvas.getBoundingClientRect();
    const x = (cx - rect.left - panX) / scale;
    const y = (cy - rect.top - panY) / scale;
    return { x, y };
  }

  function findNode(x, y) {
    let hit = null;
    let bestD = Infinity;
    for (const n of nodes) {
      const dx = x - n.x;
      const dy = y - n.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= n.r + 6 && d < bestD) {
        bestD = d;
        hit = n;
      }
    }
    return hit;
  }

  function onPointerDown(e) {
    e.preventDefault();
    const w = clientToWorld(e.clientX, e.clientY);
    pointerDownPos = { x: e.clientX, y: e.clientY };
    const hit = findNode(w.x, w.y);
    if (hit) {
      dragNode = hit;
      dragNode.vx = 0;
      dragNode.vy = 0;
      reheat();
      canvas.setPointerCapture(e.pointerId);
    } else {
      isPanning = true;
      panStart = { x: e.clientX - panX, y: e.clientY - panY };
      canvas.style.cursor = 'grabbing';
      canvas.setPointerCapture(e.pointerId);
    }
  }

  function onPointerMove(e) {
    const w = clientToWorld(e.clientX, e.clientY);
    if (dragNode) {
      dragNode.x = w.x;
      dragNode.y = w.y;
      reheat();
      return;
    }
    if (isPanning) {
      panX = e.clientX - panStart.x;
      panY = e.clientY - panStart.y;
      return;
    }
    const hit = findNode(w.x, w.y);
    if (hit !== hoverNode) {
      hoverNode = hit;
      canvas.style.cursor = hit ? 'pointer' : 'grab';
    }
    if (hoverNode) {
      tooltip.style.display = 'block';
      tooltip.innerHTML = `<div class="gt-tag">#${hoverNode.id}</div>
        <div class="gt-meta">${hoverNode.count} 题 · ${neighbors[hoverNode.id].size - 1} 关联</div>`;
      const wrapRect = wrap.getBoundingClientRect();
      tooltip.style.left = (e.clientX - wrapRect.left + 14) + 'px';
      tooltip.style.top = (e.clientY - wrapRect.top + 14) + 'px';
    } else {
      tooltip.style.display = 'none';
    }
  }

  function onPointerUp(e) {
    const moved = pointerDownPos && (
      Math.abs(e.clientX - pointerDownPos.x) > 4 ||
      Math.abs(e.clientY - pointerDownPos.y) > 4
    );
    if (dragNode && !moved) {
      applyFilter(dragNode.id);
    }
    dragNode = null;
    isPanning = false;
    panStart = null;
    pointerDownPos = null;
    canvas.style.cursor = hoverNode ? 'pointer' : 'grab';
  }

  function onWheel(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const newScale = Math.max(0.25, Math.min(3, scale * factor));
    const k = newScale / scale;
    panX = mx - (mx - panX) * k;
    panY = my - (my - panY) * k;
    scale = newScale;
  }

  function onLeave() {
    hoverNode = null;
    tooltip.style.display = 'none';
    canvas.style.cursor = 'grab';
  }

  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  function onResize() {
    fitCanvas();
    reheat();
  }
  window.addEventListener('resize', onResize);

  function zoomBy(factor) {
    const newScale = Math.max(0.25, Math.min(3, scale * factor));
    const k = newScale / scale;
    panX = W / 2 - (W / 2 - panX) * k;
    panY = H / 2 - (H / 2 - panY) * k;
    scale = newScale;
  }

  function resetView() {
    scale = 1;
    panX = 0;
    panY = 0;
    nodes.forEach(n => {
      n.x = W / 2 + (Math.random() - 0.5) * Math.min(W, 400);
      n.y = H / 2 + (Math.random() - 0.5) * Math.min(H, 400);
      n.vx = 0; n.vy = 0;
    });
    alpha = 1;
  }

  function focusOnTag(tag) {
    const node = nodes.find(n => n.id.toLowerCase().includes(tag.toLowerCase()));
    if (!node) return;
    hoverNode = node;
    panX = W / 2 - node.x * scale;
    panY = H / 2 - node.y * scale;
  }

  graphSim = {
    zoomIn: () => zoomBy(1.25),
    zoomOut: () => zoomBy(0.8),
    reset: resetView,
    recompute: () => { resetView(); },
    focus: focusOnTag,
    cleanup: () => {
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
    }
  };

  loop();
}

function applyFilter(tag) {
  graphFilterTag = tag;
  const count = graphMistakes.filter(m => (m.tags || []).includes(tag)).length;

  const panel = document.getElementById('graph-tag-panel');
  document.getElementById('graph-tag-name').textContent = tag;
  document.getElementById('graph-tag-count').textContent = `${count} 道错题`;
  panel.style.display = 'flex';
}

async function refreshVault() {
  try {
    vaultState.data = await listMistakes({}, 1000);
  } catch {
    vaultState.data = [];
  }
  renderVaultTagFilter();
  renderVault();
}

function renderVaultTagFilter() {
  const tagCounts = {};
  vaultState.data.forEach(m => {
    (m.tags || []).forEach(t => {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    });
  });
  const sorted = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);
  const wrap = document.getElementById('vfilter-tags');
  const group = document.getElementById('vfilter-tags-group');
  if (sorted.length === 0) {
    group.style.display = 'none';
    return;
  }
  group.style.display = 'flex';
  wrap.innerHTML = `<div class="chip ${vaultState.tag === '' ? 'chip-on' : ''}" data-tag="">全部</div>` +
    sorted.slice(0, 30).map(t =>
      `<div class="chip ${vaultState.tag === t ? 'chip-on' : ''}" data-tag="${t}">#${t} <span class="chip-count mono">${tagCounts[t]}</span></div>`
    ).join('');
  wrap.querySelectorAll('.chip').forEach(chip => {
    chip.onclick = () => {
      vaultState.tag = chip.dataset.tag;
      wrap.querySelectorAll('.chip').forEach(c => c.classList.remove('chip-on'));
      chip.classList.add('chip-on');
      renderVault();
      updateFilterCount();
    };
  });
}

function updateFilterCount() {
  let count = 0;
  if (vaultState.subject) count++;
  if (vaultState.status) count++;
  if (vaultState.difficulty) count++;
  if (vaultState.tag) count++;
  const el = document.getElementById('vault-filter-count');
  if (count > 0) {
    el.style.display = 'inline-flex';
    el.textContent = count;
  } else {
    el.style.display = 'none';
  }
}

function applyVaultFilters(list) {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const q = vaultState.search.trim().toLowerCase();

  return list.filter(m => {
    if (vaultState.subject && m.subject !== vaultState.subject) return false;
    if (vaultState.difficulty && String(m.difficulty) !== vaultState.difficulty) return false;
    if (vaultState.tag && !(m.tags || []).includes(vaultState.tag)) return false;

    if (vaultState.status === 'mastered' && !m.mastered) return false;
    if (vaultState.status === 'learning' && m.mastered) return false;
    if (vaultState.status === 'due') {
      if (m.mastered) return false;
      if (!m.nextReview || new Date(m.nextReview) > now) return false;
    }

    if (q) {
      const hay = [
        m.title, m.content, m.errorReason, m.note,
        ...(m.tags || []),
        subjects[m.subject]?.name
      ].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function applyVaultSort(list) {
  const [key, dir] = vaultState.sort.split('-');
  const sign = dir === 'asc' ? 1 : -1;
  const sorted = [...list];
  sorted.sort((a, b) => {
    let va = a[key], vb = b[key];
    if (key === 'createdAt' || key === 'nextReview') {
      va = va ? new Date(va).getTime() : 0;
      vb = vb ? new Date(vb).getTime() : 0;
    } else if (key === 'errorCount' || key === 'difficulty') {
      va = va || 0; vb = vb || 0;
    } else if (key === 'title') {
      va = (va || a.content || '').toString();
      vb = (vb || b.content || '').toString();
      return sign * va.localeCompare(vb, 'zh');
    }
    return sign * (va > vb ? 1 : va < vb ? -1 : 0);
  });
  return sorted;
}

function renderVault() {
  const filtered = applyVaultSort(applyVaultFilters(vaultState.data));
  document.getElementById('vault-stats').textContent =
    `${filtered.length} / ${vaultState.data.length} entries`;

  const body = document.getElementById('vault-body');

  if (filtered.length === 0) {
    body.innerHTML = `<div class="empty">
      <span class="empty-emoji">🪶</span>
      <span class="empty-title">没有匹配项</span>
      <span class="empty-sub">调整筛选条件试试</span>
    </div>`;
    return;
  }

  if (vaultState.view === 'table') {
    body.innerHTML = renderVaultTable(filtered);
  } else if (vaultState.view === 'gallery') {
    body.innerHTML = renderVaultGallery(filtered);
  } else {
    body.innerHTML = renderVaultBoard(filtered);
  }

  body.querySelectorAll('[data-id]').forEach(el => {
    el.onclick = () => openDetail(el.dataset.id);
  });
}

function statusOf(m) {
  if (m.mastered) return { key: 'mastered', label: '已掌握' };
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  if (m.nextReview && new Date(m.nextReview) <= now) return { key: 'due', label: '待复习' };
  return { key: 'learning', label: '复习中' };
}

function renderVaultTable(list) {
  const head = `
    <div class="vt-row vt-head">
      <div class="vt-cell vt-c-title">题目</div>
      <div class="vt-cell vt-c-subj">科目</div>
      <div class="vt-cell vt-c-tags">标签</div>
      <div class="vt-cell vt-c-diff">难度</div>
      <div class="vt-cell vt-c-cnt">错次</div>
      <div class="vt-cell vt-c-status">状态</div>
      <div class="vt-cell vt-c-next">下次复习</div>
    </div>`;
  const rows = list.map(m => {
    const st = statusOf(m);
    const tags = (m.tags || []).slice(0, 3).map(t => `<span class="vt-tag">#${t}</span>`).join('');
    const more = (m.tags?.length || 0) > 3 ? `<span class="vt-tag-more mono">+${m.tags.length - 3}</span>` : '';
    const titleText = m.title || m.content || '未命名';
    return `
      <div class="vt-row" data-id="${m._id}">
        <div class="vt-cell vt-c-title">
          <span class="vt-title-text md-rendered">${renderContent(titleText)}</span>
        </div>
        <div class="vt-cell vt-c-subj">
          <span class="tag tag-${m.subject}">${subjects[m.subject]?.name || '其他'}</span>
        </div>
        <div class="vt-cell vt-c-tags">${tags}${more}</div>
        <div class="vt-cell vt-c-diff">
          <div class="dots">${[1,2,3].map(d => `<div class="dot ${d <= m.difficulty ? 'on' : ''}"></div>`).join('')}</div>
        </div>
        <div class="vt-cell vt-c-cnt"><span class="vt-cnt-pill">×${m.errorCount || 1}</span></div>
        <div class="vt-cell vt-c-status"><span class="status-pill status-${st.key}">${st.label}</span></div>
        <div class="vt-cell vt-c-next mono">${m.nextReview ? formatDate(m.nextReview) : '—'}</div>
      </div>`;
  }).join('');
  return `<div class="vault-table">${head}${rows}</div>`;
}

function renderVaultGallery(list) {
  return `<div class="vault-gallery">
    ${list.map(m => {
      const st = statusOf(m);
      const cover = m.imageUrl
        ? `<img class="gc-cover" src="${m.imageUrl}" />`
        : `<div class="gc-cover gc-cover-fallback gc-cover-${m.subject}">
            <span class="gc-fallback-letter">${subjects[m.subject]?.name?.[0] || '题'}</span>
          </div>`;
      const tags = (m.tags || []).slice(0, 3).map(t => `<span class="vt-tag">#${t}</span>`).join('');
      return `
        <div class="gallery-card" data-id="${m._id}">
          ${cover}
          <div class="gc-body">
            <div class="gc-meta">
              <span class="tag tag-${m.subject}">${subjects[m.subject]?.name || '其他'}</span>
              <span class="status-pill status-${st.key}">${st.label}</span>
            </div>
            <div class="gc-title md-rendered">${renderContent(m.title || m.content || '未命名')}</div>
            <div class="gc-tags">${tags}</div>
            <div class="gc-foot">
              <div class="dots">${[1,2,3].map(d => `<div class="dot ${d <= m.difficulty ? 'on' : ''}"></div>`).join('')}</div>
              <span class="gc-cnt mono">×${m.errorCount || 1}</span>
            </div>
          </div>
        </div>`;
    }).join('')}
  </div>`;
}

function renderVaultBoard(list) {
  const order = ['math', 'physics', 'chemistry', 'biology', 'chinese', 'english', 'history', 'geography', 'politics', 'other'];
  const groups = {};
  order.forEach(k => { groups[k] = []; });
  list.forEach(m => {
    const subj = m.subject || 'other';
    if (!groups[subj]) groups[subj] = [];
    groups[subj].push(m);
  });

  const cols = order.filter(k => groups[k].length > 0);

  return `<div class="vault-board">
    ${cols.map(k => `
      <div class="board-col">
        <div class="board-col-head">
          <span class="board-col-title">
            <span class="board-col-dot bg-${k}"></span>
            ${subjects[k]?.name || k}
          </span>
          <span class="board-col-count mono">${groups[k].length}</span>
        </div>
        <div class="board-col-body">
          ${groups[k].map(m => {
                const st = statusOf(m);
                const tags = (m.tags || []).slice(0, 2).map(t => `<span class="vt-tag">#${t}</span>`).join('');
                return `
                  <div class="board-card" data-id="${m._id}">
                    <div class="bc-title md-rendered">${renderContent(m.title || m.content || '未命名')}</div>
                    <div class="bc-tags">${tags}</div>
                    <div class="bc-foot">
                      <span class="status-pill status-${st.key}">${st.label}</span>
                      <span class="bc-cnt mono">×${m.errorCount || 1}</span>
                    </div>
                  </div>`;
              }).join('')}
        </div>
      </div>
    `).join('')}
  </div>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

async function loadDetail(id) {
  document.getElementById('detail-content').style.display = 'none';
  document.getElementById('detail-loading').style.display = 'flex';

  try {
    const m = await getMistake(id);
    if (!m) {
      showToast('错题不存在');
      return;
    }

    document.getElementById('detail-content').style.display = 'block';
    document.getElementById('detail-loading').style.display = 'none';

    document.getElementById('detail-subject-tag').textContent = subjects[m.subject]?.name || '其他';
    document.getElementById('detail-subject-tag').className = `tag tag-${m.subject}`;

    document.getElementById('detail-difficulty-dots').innerHTML = [1,2,3].map(d =>
      `<div class="dot ${d <= m.difficulty ? 'on' : ''}"></div>`
    ).join('');

    const titleEl = document.getElementById('detail-title');
    titleEl.innerHTML = renderContent(m.title || m.content);
    titleEl.classList.add('md-rendered');

    const imgEl = document.getElementById('detail-image');
    if (m.imageUrl) {
      imgEl.src = m.imageUrl;
      imgEl.style.display = 'block';
    } else {
      imgEl.style.display = 'none';
    }

    const ctEl = document.getElementById('detail-content-text');
    ctEl.innerHTML = renderContent(m.content || '—');
    ctEl.classList.add('md-rendered');

    const errorBox = document.getElementById('detail-error-box');
    if (m.errorReason) {
      errorBox.style.display = 'flex';
      const erEl = document.getElementById('detail-error-reason');
      erEl.innerHTML = renderContent(m.errorReason);
      erEl.classList.add('md-rendered');
    } else {
      errorBox.style.display = 'none';
    }

    const noteSection = document.getElementById('detail-note-section');
    if (m.note) {
      noteSection.style.display = 'block';
      const noteEl = document.getElementById('detail-note');
      noteEl.innerHTML = renderContent(m.note);
      noteEl.classList.add('md-rendered');
    } else {
      noteSection.style.display = 'none';
    }

    const tagsSection = document.getElementById('detail-tags-section');
    if (m.tags?.length) {
      tagsSection.style.display = 'block';
      document.getElementById('detail-tags').innerHTML = m.tags.map(t =>
        `<span class="d-tag">#${t}</span>`
      ).join('');
    } else {
      tagsSection.style.display = 'none';
    }

    document.getElementById('detail-error-count').textContent = m.errorCount || 1;
    document.getElementById('detail-last-reviewed').textContent = m.lastReviewed ? formatDate(m.lastReviewed) : '从未';
    document.getElementById('detail-next-review').textContent = m.nextReview ? formatDate(m.nextReview) : '—';
    document.getElementById('detail-mastered').textContent = m.mastered ? '已掌握' : '复习中';
    const detailInterval = document.getElementById('detail-interval');
    if (detailInterval) {
      detailInterval.textContent = m.interval ? `${m.interval} 天（连续 ${m.repetitions || 0} 次）` : '—';
    }

    const toggleBtn = document.getElementById('btn-toggle-mastered');
    toggleBtn.textContent = m.mastered ? '标为复习中' : '标为已掌握';
  } catch (err) {
    showToast('加载失败');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  document.getElementById('page-index').classList.add('active');
  document.querySelector('.tab-item[data-page="index"]').classList.add('active');
  refreshIndex();

  document.getElementById('theme-toggle').onclick = toggleTheme;

  document.querySelectorAll('.tab-item').forEach(tab => {
    tab.onclick = () => navigateTo(tab.dataset.page);
  });

  document.getElementById('btn-start-review').onclick = () => {
    cardState.list = [];
    cardState.cursor = 0;
    cardState.flipped = false;
    navigateTo('card');
  };

  document.getElementById('btn-add-new').onclick = () => navigateTo('add');

  document.getElementById('flip-card').onclick = () => {
    cardState.flipped = !cardState.flipped;
    document.getElementById('flip-card').classList.toggle('is-flipped', cardState.flipped);
    document.getElementById('rate-buttons').classList.toggle('rate-locked', !cardState.flipped);
  };

  document.querySelectorAll('.rate-btn').forEach(btn => {
    btn.onclick = () => rateCard(btn.dataset.rating);
  });

  document.getElementById('card-back').onclick = () => navigateTo('index');
  document.getElementById('card-back-home').onclick = () => navigateTo('index');

  // filter-clear 和 filter-section 已移除，相关逻辑删除

  // Graph controls
  const gcZoomIn = document.getElementById('gc-zoom-in');
  const gcZoomOut = document.getElementById('gc-zoom-out');
  const gcReset = document.getElementById('gc-reset');
  const gcRecompute = document.getElementById('gc-recompute');
  if (gcZoomIn) gcZoomIn.onclick = () => graphSim?.zoomIn();
  if (gcZoomOut) gcZoomOut.onclick = () => graphSim?.zoomOut();
  if (gcReset) gcReset.onclick = () => graphSim?.reset();
  if (gcRecompute) gcRecompute.onclick = () => graphSim?.recompute();

  const graphSearch = document.getElementById('graph-search-input');
  if (graphSearch) {
    graphSearch.oninput = (e) => {
      const v = e.target.value.trim();
      if (v && graphSim) graphSim.focus(v);
    };
  }

  const graphFs = document.getElementById('graph-fullscreen');
  if (graphFs) {
    graphFs.onclick = () => {
      const wrap = document.getElementById('graph-wrap');
      wrap.classList.toggle('graph-fullscreen');
      setTimeout(() => {
        if (graphSim) graphSim.reset();
        refreshGraph();
      }, 50);
    };
  }

  // Vault wiring
  document.querySelectorAll('#view-tabs .view-tab').forEach(tab => {
    tab.onclick = () => {
      vaultState.view = tab.dataset.view;
      document.querySelectorAll('#view-tabs .view-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderVault();
    };
  });

  const vSearch = document.getElementById('vault-search');
  vSearch.oninput = (e) => {
    vaultState.search = e.target.value;
    renderVault();
  };

  const vFilterBtn = document.getElementById('vault-filter-btn');
  const vFilterPanel = document.getElementById('vault-filter-panel');
  vFilterBtn.onclick = () => {
    const open = vFilterPanel.style.display !== 'none';
    vFilterPanel.style.display = open ? 'none' : 'flex';
    vFilterBtn.classList.toggle('on', !open);
    document.getElementById('vault-sort-menu').style.display = 'none';
    document.getElementById('vault-sort-btn').classList.remove('on');
  };

  const vSortBtn = document.getElementById('vault-sort-btn');
  const vSortMenu = document.getElementById('vault-sort-menu');
  vSortBtn.onclick = () => {
    const open = vSortMenu.style.display !== 'none';
    vSortMenu.style.display = open ? 'none' : 'flex';
    vSortBtn.classList.toggle('on', !open);
    vFilterPanel.style.display = 'none';
    vFilterBtn.classList.remove('on');
  };

  document.querySelectorAll('#vault-sort-menu .sort-item').forEach(item => {
    item.onclick = () => {
      vaultState.sort = item.dataset.sort;
      const labels = {
        'createdAt-desc': '最新',
        'createdAt-asc': '最早',
        'errorCount-desc': '错次',
        'difficulty-desc': '难度',
        'nextReview-asc': '到期',
        'title-asc': '题目'
      };
      document.getElementById('vault-sort-label').textContent = labels[vaultState.sort] || '排序';
      vSortMenu.style.display = 'none';
      vSortBtn.classList.remove('on');
      renderVault();
    };
  });

  function bindFilterChips(containerId, key) {
    document.querySelectorAll(`#${containerId} .chip`).forEach(chip => {
      chip.onclick = () => {
        const value = chip.dataset[key];
        vaultState[key] = value;
        document.querySelectorAll(`#${containerId} .chip`).forEach(c => c.classList.remove('chip-on'));
        chip.classList.add('chip-on');
        renderVault();
        updateFilterCount();
      };
    });
  }
  bindFilterChips('vfilter-subjects', 'subject');
  bindFilterChips('vfilter-status', 'status');
  bindFilterChips('vfilter-diff', 'difficulty');

  document.getElementById('upload-area').onclick = (e) => {
    if (e.target.closest('#upload-actions')) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      compressImage(file, (base64) => {
        document.getElementById('image-preview').src = base64;
        document.getElementById('image-preview').style.display = 'block';
        document.getElementById('upload-empty').style.display = 'none';
        document.getElementById('upload-actions').style.display = 'flex';
      });
    };
    input.click();
  };

  document.getElementById('btn-remove-image').onclick = () => {
    document.getElementById('image-preview').style.display = 'none';
    document.getElementById('upload-empty').style.display = 'flex';
    document.getElementById('upload-actions').style.display = 'none';
  };

  // Markdown 实时预览
  function setupPreview(textareaId, previewId, toggleId) {
    const ta = document.getElementById(textareaId);
    const pv = document.getElementById(previewId);
    const tg = document.getElementById(toggleId);
    if (!ta || !pv || !tg) return;
    let shown = false;
    tg.onclick = () => {
      shown = !shown;
      pv.style.display = shown ? 'block' : 'none';
      tg.classList.toggle('on', shown);
      tg.textContent = shown ? '编辑' : '预览';
      if (shown) pv.innerHTML = renderContent(ta.value);
    };
    ta.oninput = () => { if (shown) pv.innerHTML = renderContent(ta.value); };
  }
  setupPreview('form-content', 'form-content-preview', 'form-content-preview-toggle');
  setupPreview('form-note', 'form-note-preview', 'form-note-preview-toggle');

  // 图谱节点标签面板 → 跳转题库
  const graphTagPanel = document.getElementById('graph-tag-panel');
  document.getElementById('graph-tag-close')?.addEventListener('click', () => {
    graphTagPanel.style.display = 'none';
    graphFilterTag = '';
  });
  document.getElementById('graph-tag-goto')?.addEventListener('click', () => {
    vaultState.tag = graphFilterTag;
    vaultState.subject = '';
    vaultState.status = '';
    vaultState.difficulty = '';
    vaultState.search = '';
    // 重置 vault filter chips UI
    document.querySelectorAll('#vfilter-subjects .chip').forEach(c => c.classList.remove('chip-on'));
    document.querySelector('#vfilter-subjects [data-subject=""]')?.classList.add('chip-on');
    document.querySelectorAll('#vfilter-status .chip').forEach(c => c.classList.remove('chip-on'));
    document.querySelector('#vfilter-status [data-status=""]')?.classList.add('chip-on');
    document.querySelectorAll('#vfilter-diff .chip').forEach(c => c.classList.remove('chip-on'));
    document.querySelector('#vfilter-diff [data-diff=""]')?.classList.add('chip-on');
    navigateTo('vault');
    setTimeout(() => {
      // 高亮跳转的 tag chip
      const tagChip = document.querySelector(`#vfilter-tags [data-tag="${graphFilterTag}"]`);
      if (tagChip) {
        document.querySelectorAll('#vfilter-tags .chip').forEach(c => c.classList.remove('chip-on'));
        tagChip.classList.add('chip-on');
      }
      document.getElementById('vault-filter-panel').style.display = 'flex';
      updateFilterCount();
    }, 100);
  });

  document.querySelectorAll('#subject-chips .chip').forEach(chip => {
    chip.onclick = () => {
      document.querySelectorAll('#subject-chips .chip').forEach(c => c.classList.remove('chip-on'));
      chip.classList.add('chip-on');
    };
  });

  document.querySelectorAll('#difficulty-chips .chip').forEach(chip => {
    chip.onclick = () => {
      document.querySelectorAll('#difficulty-chips .chip').forEach(c => c.classList.remove('chip-on'));
      chip.classList.add('chip-on');
    };
  });

  document.getElementById('btn-save').onclick = async () => {
    const content = document.getElementById('form-content').value.trim();
    const imageUrl = document.getElementById('image-preview').style.display !== 'none'
      ? document.getElementById('image-preview').src : '';

    if (!content && !imageUrl) {
      showToast('题目描述或图片至少填一项');
      return;
    }

    const subjectChip = document.querySelector('#subject-chips .chip-on');
    const subject = subjectChip?.dataset.key || 'math';

    const diffChip = document.querySelector('#difficulty-chips .chip-on');
    const difficulty = parseInt(diffChip?.dataset.value || '2');

    const tagsRaw = document.getElementById('form-tags').value;
    const tags = tagsRaw.split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean);

    const payload = {
      title: content.slice(0, 30) || '未命名错题',
      content,
      imageUrl,
      subject,
      topic: tags[0] || '',
      tags,
      errorReason: document.getElementById('form-error-reason').value.trim(),
      difficulty,
      errorCount: 1,
      note: document.getElementById('form-note').value.trim(),
      mastered: false,
      interval: 1,
      nextReview: computeNextSRS('hard', { easeFactor: 2.5, interval: 1, repetitions: 0 }).nextReview,
      lastReviewed: null,
      relatedIds: []
    };

    try {
      await addMistake(payload);
      showToast('已加入错题本', 800);
      setTimeout(() => {
        navigateTo('index');
        document.getElementById('form-content').value = '';
        document.getElementById('form-tags').value = '';
        document.getElementById('form-error-reason').value = '';
        document.getElementById('form-note').value = '';
        document.getElementById('image-preview').style.display = 'none';
        document.getElementById('upload-empty').style.display = 'flex';
        document.getElementById('upload-actions').style.display = 'none';
        document.querySelectorAll('#subject-chips .chip').forEach(c => c.classList.remove('chip-on'));
        document.querySelector('#subject-chips .chip[data-key="math"]').classList.add('chip-on');
        document.querySelectorAll('#difficulty-chips .chip').forEach(c => c.classList.remove('chip-on'));
        document.querySelector('#difficulty-chips .chip[data-value="2"]').classList.add('chip-on');
      }, 800);
    } catch (err) {
      showToast('保存失败');
    }
  };

  document.getElementById('btn-cancel').onclick = () => navigateTo('index');

  document.getElementById('btn-review-now').onclick = () => {
    openCard(currentDetailId);
  };

  document.getElementById('btn-toggle-mastered').onclick = async () => {
    const m = await getMistake(currentDetailId);
    if (!m) return;
    try {
      await updateMistake(m._id, { mastered: !m.mastered });
      showToast(m.mastered ? '复习中' : '已掌握');
      loadDetail(currentDetailId);
    } catch {
      showToast('操作失败');
    }
  };

  document.getElementById('btn-delete').onclick = async () => {
    const confirm = await showModal('删除错题', '该操作不可恢复，确定要删除吗？', '确定', '取消');
    if (!confirm) return;
    try {
      await deleteMistake(currentDetailId);
      showToast('已删除');
      setTimeout(() => navigateTo('index'), 600);
    } catch {
      showToast('删除失败');
    }
  };

  // 注册 Service Worker (PWA)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(err => {
      console.log('SW registration failed:', err);
    });
  }
});
