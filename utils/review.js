// SM-2 间隔重复算法
function computeNextSRS(rating, card) {
  // quality: easy=5, medium=3, hard=1
  const q = rating === 'easy' ? 5 : rating === 'medium' ? 3 : 1;
  let ef = typeof card.easeFactor === 'number' ? card.easeFactor : 2.5;
  let interval = typeof card.interval === 'number' ? card.interval : 1;
  let reps = typeof card.repetitions === 'number' ? card.repetitions : 0;

  if (q >= 3) {
    if (reps === 0) interval = q === 5 ? 4 : 1;
    else if (reps === 1) interval = q === 5 ? 6 : 4;
    else interval = Math.max(1, Math.round(interval * ef));
    ef = Math.max(1.3, ef + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    reps += 1;
  } else {
    reps = 0;
    interval = 1;
    ef = Math.max(1.3, ef - 0.2);
  }

  const next = new Date();
  next.setDate(next.getDate() + interval);
  next.setHours(0, 0, 0, 0);

  return { nextReview: next.toISOString(), interval, easeFactor: ef, repetitions: reps };
}

// 预览三种评分下的间隔（不修改状态）
function previewSRSIntervals(card) {
  return {
    easy:   computeNextSRS('easy',   { ...card }),
    medium: computeNextSRS('medium', { ...card }),
    hard:   computeNextSRS('hard',   { ...card })
  };
}

function formatInterval(days) {
  if (days <= 0) return '今天';
  if (days === 1) return '明天';
  if (days < 30) return `+${days}天`;
  if (days < 365) return `+${Math.round(days / 30)}月`;
  return `+${(days / 365).toFixed(1)}年`;
}

function isDueToday(nextReview) {
  if (!nextReview) return true;
  const next = new Date(nextReview);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return next.getTime() <= today.getTime();
}

function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function relativeDay(d) {
  if (!d) return '';
  const date = new Date(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === -1) return '昨天';
  if (diff > 0) return `${diff} 天后`;
  return `${-diff} 天前`;
}
