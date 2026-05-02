const COLL_MISTAKES = 'mistakes';
const COLL_REVIEWS = 'reviews';

function _getStore(name) {
  try {
    return JSON.parse(localStorage.getItem(name) || '[]');
  } catch {
    return [];
  }
}

function _setStore(name, data) {
  try {
    localStorage.setItem(name, JSON.stringify(data));
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      throw new Error('存储空间已满，请清理旧错题后再试');
    }
    throw e;
  }
}

function _genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function listMistakes(filter = {}, limit = 50) {
  let data = _getStore(COLL_MISTAKES);

  if (Object.keys(filter).length) {
    data = data.filter(m => {
      return Object.entries(filter).every(([k, v]) => m[k] === v);
    });
  }

  data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return data.slice(0, limit);
}

async function listDueMistakes(limit = 30) {
  let data = _getStore(COLL_MISTAKES);
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  data = data.filter(m => {
    return !m.mastered && m.nextReview && new Date(m.nextReview) <= now;
  });

  data.sort((a, b) => new Date(a.nextReview) - new Date(b.nextReview));
  return data.slice(0, limit);
}

async function getStats() {
  const data = _getStore(COLL_MISTAKES);
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  const total = data.length;
  const due = data.filter(m => !m.mastered && m.nextReview && new Date(m.nextReview) <= now).length;
  const mastered = data.filter(m => m.mastered).length;

  return { total, due, mastered };
}

async function getMistake(id) {
  const data = _getStore(COLL_MISTAKES);
  return data.find(m => m._id === id) || null;
}

async function addMistake(payload) {
  const data = _getStore(COLL_MISTAKES);
  const newItem = {
    ...payload,
    _id: _genId(),
    createdAt: new Date().toISOString()
  };
  data.push(newItem);
  _setStore(COLL_MISTAKES, data);
  return newItem._id;
}

async function updateMistake(id, updates) {
  const data = _getStore(COLL_MISTAKES);
  const idx = data.findIndex(m => m._id === id);
  if (idx === -1) throw new Error('Mistake not found');

  data[idx] = { ...data[idx], ...updates };
  _setStore(COLL_MISTAKES, data);
  return data[idx];
}

async function deleteMistake(id) {
  let data = _getStore(COLL_MISTAKES);
  data = data.filter(m => m._id !== id);
  _setStore(COLL_MISTAKES, data);

  let reviews = _getStore(COLL_REVIEWS);
  reviews = reviews.filter(r => r.mistakeId !== id);
  _setStore(COLL_REVIEWS, reviews);
}

async function addReview(mistakeId, rating) {
  const data = _getStore(COLL_REVIEWS);
  data.push({
    mistakeId,
    rating,
    reviewedAt: new Date().toISOString()
  });
  _setStore(COLL_REVIEWS, data);
}
