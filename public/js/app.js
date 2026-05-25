'use strict';

/* ─── Navbar + Mobile Drawer ─── */
const navbar    = document.getElementById('navbar');
const hamburger = document.getElementById('hamburger');
const drawer    = document.getElementById('mobileDrawer');
const drawerClose = document.getElementById('drawerClose');

window.addEventListener('scroll', () => {
  navbar?.classList.toggle('scrolled', window.scrollY > 50);
}, { passive: true });

function openDrawer() {
  drawer?.classList.add('open');
  hamburger?.classList.add('open');
  hamburger?.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
}
function closeDrawer() {
  drawer?.classList.remove('open');
  hamburger?.classList.remove('open');
  hamburger?.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

hamburger?.addEventListener('click', () => {
  drawer?.classList.contains('open') ? closeDrawer() : openDrawer();
});
drawerClose?.addEventListener('click', closeDrawer);
drawer?.addEventListener('click', e => { if (e.target === drawer) closeDrawer(); });
drawer?.querySelectorAll('a').forEach(a => a.addEventListener('click', closeDrawer));

/* ─── Counter animation ─── */
function animateCounter(el) {
  const target = parseInt(el.dataset.target, 10);
  const start  = performance.now();
  const dur    = 1800;
  const step   = ts => {
    const p = Math.min((ts - start) / dur, 1);
    el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * target);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const statsEl = document.querySelector('.hero-stats');
if (statsEl) {
  new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      statsEl.querySelectorAll('.stat-num').forEach(animateCounter);
    }
  }, { threshold: .5 }).observe(statsEl);
}

/* ─── API helper ─── */
const api = url => fetch(url).then(r => r.json()).catch(() => null);

/* ═══════════════════════════════
   TODAY'S SPECIAL
═══════════════════════════════ */
async function loadTodaySpecial() {
  const s   = await api('/api/today');
  const sec = document.getElementById('todaySpecial');
  const card = document.getElementById('specialCard');
  if (!s?.name || !sec || !card) return;
  sec.style.display = 'block';
  card.className = 'special-wrap';
  card.innerHTML = `
    <img src="${s.imageUrl}" alt="${s.name}" class="sp-img"
         onerror="this.style.display='none'">
    <div class="sp-body">
      <div class="sp-badge">🌟 Today's Special</div>
      <h3 class="sp-name">${s.name}</h3>
      ${s.ingredients?.length ? `<p style="color:var(--muted);font-size:.86rem;margin-bottom:.4rem">${s.ingredients.join(' · ')}</p>` : ''}
      <div class="sp-price">₹${s.price}</div>
      <a href="https://wa.me/919168445014?text=Hi!%20I'd%20like%20to%20order%20today's%20special%3A%20${encodeURIComponent(s.name)}"
         class="btn btn-wa" target="_blank" rel="noopener">
        <i class="fab fa-whatsapp"></i> Order This Now
      </a>
    </div>`;
}

/* ═══════════════════════════════
   CAKES
═══════════════════════════════ */
let allCakes = [];

async function loadCakes() {
  const grid  = document.getElementById('cakesGrid');
  const empty = document.getElementById('cakesEmpty');
  const filterEl = document.getElementById('filterBar');
  if (!grid) return;

  allCakes = await api('/api/products') || [];
  if (!allCakes.length) {
    grid.innerHTML = '';
    empty && (empty.style.display = 'block');
    return;
  }

  const cats = ['All', ...new Set(allCakes.map(c => c.category || 'General'))];
  filterEl.innerHTML = cats.map(c =>
    `<button class="filter-btn${c==='All'?' active':''}" data-filter="${c}">${c==='All'?'All Cakes':c}</button>`
  ).join('');

  filterEl.addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    filterEl.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderCakes(btn.dataset.filter);
  });

  renderCakes('All');
}

function renderCakes(filter) {
  const grid = document.getElementById('cakesGrid');
  const list = filter === 'All' ? allCakes : allCakes.filter(c => (c.category||'General') === filter);
  if (!list.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-cake-candles"></i><p>No cakes in this category yet.</p></div>`;
    return;
  }
  grid.innerHTML = list.map((c, i) => `
    <article class="cake-card">
      <div class="cake-img-wrap">
        <img class="cake-img" src="${c.imageUrl}" alt="${c.name} — Dory's Bakehouse Baner Pune"
             loading="${i < 4 ? 'eager' : 'lazy'}"
             onerror="this.closest('.cake-img-wrap').style.background='var(--pink-lt)'">
        <div class="cake-badges">
          ${c.eggless ? '<span class="cbadge eggless">🌿 Eggless</span>' : ''}
        </div>
        <button class="cake-wishlist" onclick="toggleWish(this)" aria-label="Save">
          <i class="far fa-heart"></i>
        </button>
      </div>
      <div class="cake-body">
        <div class="cake-cat">${c.category||'Signature'}</div>
        <h3 class="cake-name">${c.name}</h3>
        ${c.description ? `<p class="cake-desc">${c.description}</p>` : ''}
        <div class="cake-footer">
          <span class="cake-price">₹${c.price}</span>
          <button class="cake-btn" onclick="orderCake('${c.name.replace(/'/g,"\\'").replace(/"/g,'&quot;')}',${c.price})">
            Order Now
          </button>
        </div>
      </div>
    </article>`).join('');
}

function toggleWish(btn) {
  btn.classList.toggle('loved');
  btn.querySelector('i').className = btn.classList.contains('loved') ? 'fas fa-heart' : 'far fa-heart';
}

function orderCake(name, price) {
  const msg = `Hi! I'd like to order: *${name}* — ₹${price}. Please confirm availability!`;
  window.open(`https://wa.me/919168445014?text=${encodeURIComponent(msg)}`, '_blank');
}

/* ═══════════════════════════════
   GALLERY
═══════════════════════════════ */
let galleryImages = [];
let lbIdx = 0;

async function loadGallery() {
  const grid  = document.getElementById('galleryGrid');
  const empty = document.getElementById('galleryEmpty');
  const more  = document.getElementById('galleryMore');
  if (!grid) return;

  galleryImages = await api('/api/gallery') || [];
  if (!galleryImages.length) {
    grid.innerHTML = '';
    empty && (empty.style.display = 'block');
    return;
  }

  const shown = galleryImages.slice(0, 12);
  grid.innerHTML = shown.map((img, i) => `
    <div class="gal-item" data-idx="${i}">
      <img class="gal-img" src="${img.url}"
           alt="${img.title || 'Cake from Dory\'s Bakehouse Baner Pune'}" loading="lazy"
           onerror="this.closest('.gal-item').style.display='none'">
      <div class="gal-overlay"><i class="fas fa-expand-alt"></i></div>
    </div>`).join('');

  grid.addEventListener('click', e => {
    const item = e.target.closest('.gal-item');
    if (item) openLb(parseInt(item.dataset.idx));
  });

  if (galleryImages.length > 12 && more) more.style.display = 'block';
}

/* Lightbox */
const lb    = document.getElementById('lightbox');
const lbImg = document.getElementById('lbImg');

function openLb(i) {
  lbIdx = i;
  lbImg.src = galleryImages[i].url;
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeLb() { lb?.classList.remove('open'); document.body.style.overflow = ''; }

document.getElementById('lbClose')?.addEventListener('click', closeLb);
lb?.addEventListener('click', e => { if (e.target === lb) closeLb(); });
document.getElementById('lbPrev')?.addEventListener('click', () => {
  lbIdx = (lbIdx - 1 + galleryImages.length) % galleryImages.length;
  lbImg.src = galleryImages[lbIdx].url;
});
document.getElementById('lbNext')?.addEventListener('click', () => {
  lbIdx = (lbIdx + 1) % galleryImages.length;
  lbImg.src = galleryImages[lbIdx].url;
});
document.addEventListener('keydown', e => {
  if (!lb?.classList.contains('open')) return;
  if (e.key === 'Escape') closeLb();
  if (e.key === 'ArrowLeft') document.getElementById('lbPrev').click();
  if (e.key === 'ArrowRight') document.getElementById('lbNext').click();
});

/* Swipe on lightbox */
let touchStartX = 0;
lb?.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
lb?.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(dx) < 50) return;
  if (dx < 0) document.getElementById('lbNext').click();
  else document.getElementById('lbPrev').click();
});

/* ═══════════════════════════════
   REVIEWS
═══════════════════════════════ */
async function loadReviews() {
  const scroll = document.getElementById('reviewsScroll');
  if (!scroll) return;
  const reviews = await api('/api/reviews') || [];
  if (!reviews.length) {
    scroll.innerHTML = `<div style="padding:2rem;color:var(--muted);min-width:260px;text-align:center">Be the first to share your experience! 🎂</div>`;
    return;
  }
  scroll.innerHTML = reviews.map(r => `
    <div class="review-card">
      <div class="rv-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
      <p class="rv-text">"${r.message}"</p>
      <div class="rv-author">
        <strong>${r.name}</strong>
        <span>${r.source} · ${new Date(r.created_at).toLocaleDateString('en-IN',{month:'short',year:'numeric'})}</span>
      </div>
    </div>`).join('');
}

/* Star rating */
let selectedRating = 5;
document.getElementById('rfStars')?.addEventListener('click', e => {
  const star = e.target.closest('i');
  if (!star) return;
  selectedRating = parseInt(star.dataset.val, 10);
  document.querySelectorAll('#rfStars i').forEach((s, i) => s.classList.toggle('active', i < selectedRating));
});

document.getElementById('submitReview')?.addEventListener('click', async () => {
  const name = document.getElementById('rName')?.value.trim();
  const msg  = document.getElementById('rMsg')?.value.trim();
  if (!msg) { alert('Please write your review first!'); return; }
  const btn = document.getElementById('submitReview');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting…';
  const res = await fetch('/api/reviews', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name || 'Anonymous', rating: selectedRating, message: msg }),
  }).catch(() => null);
  if (res?.ok) {
    document.getElementById('rName').value = '';
    document.getElementById('rMsg').value = '';
    await loadReviews();
    btn.innerHTML = '<i class="fas fa-check"></i> Thank you!';
    setTimeout(() => { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Review'; }, 3000);
  } else {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Review';
    alert('Error submitting. Please try again.');
  }
});

/* ═══════════════════════════════
   SCROLL REVEAL
═══════════════════════════════ */
function initReveal() {
  const els = document.querySelectorAll('.cake-card, .local-card, .faq-item, .story-badge, .cta-card');
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.opacity = '1';
        e.target.style.transform = 'translateY(0)';
        obs.unobserve(e.target);
      }
    });
  }, { threshold: .1, rootMargin: '0px 0px -30px 0px' });

  els.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = `opacity .45s ease ${(i % 4) * .07}s, transform .45s ease ${(i % 4) * .07}s`;
    obs.observe(el);
  });
}

/* ═══════════════════════════════
   INIT
═══════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadTodaySpecial(), loadCakes(), loadGallery(), loadReviews()]);
  initReveal();
});
