const EMBEDDING_STORAGE_KEY = 'embeddings';
const EMBEDDING_MAX_TEXT = 8000;
const BATCH_CONCURRENCY = 3;
const BATCH_DELAY_MS = 100;

function _getStoredEmbeddings() {
  try {
    return JSON.parse(localStorage.getItem(EMBEDDING_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function _saveEmbeddings(map) {
  try {
    localStorage.setItem(EMBEDDING_STORAGE_KEY, JSON.stringify(map));
    return true;
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      throw new Error('存储空间已满，无法保存 embedding。请清理旧错题或导出后删除。');
    }
    throw e;
  }
}

function mistakeToEmbeddingText(m) {
  const parts = [];
  if (m.title && m.title !== '未命名错题') parts.push(m.title);
  if (m.content) parts.push(m.content);
  if (m.note) parts.push(m.note);
  if (Array.isArray(m.tags) && m.tags.length) parts.push('知识点：' + m.tags.join('、'));
  if (m.errorReason) parts.push('错因：' + m.errorReason);
  return parts.join('\n').slice(0, EMBEDDING_MAX_TEXT);
}

async function generateEmbedding(text) {
  if (!text || !text.trim()) throw new Error('空文本无法生成 embedding');
  const cfg = (typeof getAiConfig === 'function') ? getAiConfig() : null;
  if (!cfg || !cfg.apiKey) throw new Error('AI 未配置');
  const endpoint = (cfg.endpoint || '').replace(/\/+$/, '');
  const url = `${endpoint}/embeddings`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`
    },
    body: JSON.stringify({
      input: text.slice(0, EMBEDDING_MAX_TEXT),
      model: cfg.model || 'text-embedding-3-small'
    })
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status}：${errText.slice(0, 120)}`);
  }
  const data = await resp.json();
  if (!data?.data?.[0]?.embedding) {
    throw new Error('返回数据格式异常');
  }
  return data.data[0].embedding;
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
}

const _queryCache = new Map();
const _QUERY_CACHE_MAX = 32;

async function getQueryEmbedding(query) {
  const key = (query || '').trim();
  if (!key) throw new Error('查询文本为空');
  if (_queryCache.has(key)) return _queryCache.get(key);
  const vec = await generateEmbedding(key);
  if (_queryCache.size >= _QUERY_CACHE_MAX) {
    const firstKey = _queryCache.keys().next().value;
    _queryCache.delete(firstKey);
  }
  _queryCache.set(key, vec);
  return vec;
}

async function batchGenerateEmbeddings(mistakes, onProgress) {
  const stored = _getStoredEmbeddings();
  const todo = mistakes.filter(m => m._id && !stored[m._id]);
  const total = todo.length;
  let done = 0, failed = 0;
  const errors = [];

  for (let i = 0; i < todo.length; i += BATCH_CONCURRENCY) {
    const slice = todo.slice(i, i + BATCH_CONCURRENCY);
    await Promise.all(slice.map(async (m) => {
      const text = mistakeToEmbeddingText(m);
      if (!text) { done++; return; }
      try {
        const vec = await generateEmbedding(text);
        stored[m._id] = vec;
      } catch (err) {
        failed++;
        errors.push({ id: m._id, message: err.message });
        console.warn('Embedding failed for', m._id, err);
      } finally {
        done++;
        if (onProgress) onProgress({ done, total, failed, currentId: m._id });
      }
    }));
    if (i + BATCH_CONCURRENCY < todo.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  if (total > 0) _saveEmbeddings(stored);
  return { added: total - failed, skipped: mistakes.length - total, failed, errors };
}

function findSimilarMistakes(queryVec, storedEmbeddings, topN = 20, minSim = 0) {
  const results = [];
  for (const [id, vec] of Object.entries(storedEmbeddings)) {
    if (!vec || vec.length !== queryVec.length) continue;
    const sim = cosineSimilarity(queryVec, vec);
    if (sim >= minSim) results.push({ id, similarity: sim });
  }
  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, topN);
}

function computeSimilarityGraph(storedEmbeddings, threshold = 0.7) {
  const ids = Object.keys(storedEmbeddings);
  const edges = [];
  for (let i = 0; i < ids.length; i++) {
    const vi = storedEmbeddings[ids[i]];
    if (!vi) continue;
    for (let j = i + 1; j < ids.length; j++) {
      const vj = storedEmbeddings[ids[j]];
      if (!vj || vj.length !== vi.length) continue;
      const sim = cosineSimilarity(vi, vj);
      if (sim >= threshold) {
        edges.push({ source: ids[i], target: ids[j], weight: sim });
      }
    }
  }
  return edges;
}

function deleteEmbedding(id) {
  const stored = _getStoredEmbeddings();
  if (stored[id]) {
    delete stored[id];
    _saveEmbeddings(stored);
  }
  _queryCache.clear();
}

function getEmbeddingStats() {
  const stored = _getStoredEmbeddings();
  const count = Object.keys(stored).length;
  return {
    count,
    bytes: JSON.stringify(stored).length,
    dimensions: count > 0 ? Object.values(stored)[0].length : 0
  };
}

function clearAllEmbeddings() {
  localStorage.removeItem(EMBEDDING_STORAGE_KEY);
  _queryCache.clear();
}
