/* ============================================================
   DORY'S BAKEHOUSE v4 — Frontend JS
   ============================================================ */

'use strict';

/* ─── Navbar scroll ─── */
const navbar    = document.getElementById('navbar');
const hamburger = document.getElementById('hamburger');
const navLinks  = document.getElementById('navLinks');

// Offset for announce bar
let announceH = 0;
const bar = document.getElementById('announceBar');
if (bar) announceH = bar.offsetHeight;

window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true });

/* ─── Mobile menu ─── */
hamburger?.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  hamburger.classList.toggle('open', open);
  hamburger.setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';
});
navLinks?.addEventListener('click', e => {
  if (e.target.tagName === 'A') {
    navLinks.classList.remove('open');
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }
});

/* ─── Counter animation ─── */
function animateCounter(el) {
  const target = parseInt(el.dataset.target, 10);
  const duration = 1800;
  const start = performance.now();
  const step = ts => {
    const pct = Math.min((ts - start) / duration, 1);
    const ease = 1 - Math.pow(1 - pct, 3); // ease-out cubic
    el.textContent = Math.round(ease * target);
    if (pct < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const statsObserver = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.querySelectorAll('.stat-num').forEach(animateCounter);
      statsObserver.unobserve(e.target);
    }
  });
}, { threshold: .5 });
document.querySelector('.hero-stats') && statsObserver.observe(document.querySelector('.hero-stats'));

/* ─── API helper ─── */
const api = url => fetch(url).then(r => r.json()).catch(() => null);

/* ═════════════════════════════
   TODAY'S SPECIAL
═════════════════════════════ */
async function loadTodaySpecial() {
  const s = await api('/api/today');
  if (!s?.name) return;
  const sec = document.getElementById('todaySpecial');
  const card = document.getElementById('specialCard');
  if (!sec || !card) return;
  sec.style.display = 'block';
  card.className = 'special-wrap';
  card.innerHTML = `
    <img src="${s.imageUrl}" alt="${s.name} — Today's Special at Dory's Bakehouse Baner" class="sp-img"
         onerror="this.style.display='none'">
    <div class="sp-body">
      <div class="sp-badge">🌟 Today's Special</div>
      <h3 class="sp-name">${s.name}</h3>
      ${s.ingredients?.length ? `<p style="color:var(--muted);font-size:.88rem;margin-bottom:.5rem">${s.ingredients.join(' · ')}</p>` : ''}
      <div class="sp-price">₹${s.price}</div>
      <a href="https://wa.me/919168445014?text=Hi!%20I'd%20like%20to%20order%20today's%20special%3A%20${encodeURIComponent(s.name)}"
         class="btn btn-wa" target="_blank" rel="noopener">
        <i class="fab fa-whatsapp" aria-hidden="true"></i> Order This Now
      </a>
    </div>`;
}

/* ═════════════════════════════
   CAKES
═════════════════════════════ */
let allCakes = [];

async function loadCakes() {
  const grid     = document.getElementById('cakesGrid');
  const empty    = document.getElementById('cakesEmpty');
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
    `<button class="filter-btn${c==='All'?' active':''}" data-filter="${c}">${c === 'All' ? 'All Cakes' : c}</button>`
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
  const list = filter === 'All' ? allCakes : allCakes.filter(c => (c.category || 'General') === filter);

  if (!list.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <i class="fas fa-cake-candles" aria-hidden="true"></i>
      <p>No cakes in this category yet.</p></div>`;
    return;
  }

  grid.innerHTML = list.map((c, i) => `
    <article class="cake-card" role="listitem" aria-label="${c.name} cake">
      <div class="cake-img-wrap">
        <img class="cake-img" src="${c.imageUrl}" alt="${c.name} — Custom cake at Dory's Bakehouse Baner Pune"
             loading="${i < 4 ? 'eager' : 'lazy'}"
             onerror="this.closest('.cake-img-wrap').style.background='var(--pink-lt)'">
        <div class="cake-badges">
          ${c.eggless ? '<span class="cbadge eggless">🌿 Eggless</span>' : ''}
        </div>
        <button class="cake-wishlist" aria-label="Save ${c.name}" onclick="toggleWish(this)">
          <i class="far fa-heart" aria-hidden="true"></i>
        </button>
      </div>
      <div class="cake-body">
        <div class="cake-cat">${c.category || 'Signature'}</div>
        <h3 class="cake-name">${c.name}</h3>
        ${c.description ? `<p class="cake-desc">${c.description}</p>` : ''}
        <div class="cake-footer">
          <span class="cake-price">₹${c.price}</span>
          <button class="cake-btn" onclick="orderCake('${c.name.replace(/'/g,"\\'").replace(/"/g,'&quot;')}',${c.price})"
                  aria-label="Order ${c.name} on WhatsApp">
            Order Now
          </button>
        </div>
      </div>
    </article>`).join('');
}

function toggleWish(btn) {
  btn.classList.toggle('loved');
  const icon = btn.querySelector('i');
  icon.className = btn.classList.contains('loved') ? 'fas fa-heart' : 'far fa-heart';
}

function orderCake(name, price) {
  const msg = `Hi! I'd like to order: *${name}* — ₹${price}. Please share availability and delivery details!`;
  window.open(`https://wa.me/919168445014?text=${encodeURIComponent(msg)}`, '_blank');
}

/* ═════════════════════════════
   GALLERY
═════════════════════════════ */
let galleryImages = [];
let lbIndex = 0;

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

  // Show max 12 on homepage, rest on gallery page
  const shown = galleryImages.slice(0, 12);
  grid.innerHTML = shown.map((img, i) => `
    <div class="gal-item" data-idx="${i}" role="listitem">
      <img class="gal-img" src="${img.url}"
           alt="${img.title || 'Custom cake from Dory\'s Bakehouse Baner Pune'}" loading="lazy"
           onerror="this.closest('.gal-item').style.display='none'">
      <div class="gal-overlay" aria-hidden="true"><i class="fas fa-expand-alt"></i></div>
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
  lbIndex = i;
  lbImg.src = galleryImages[i].url;
  lbImg.alt = galleryImages[i].title || 'Cake photo — Dory\'s Bakehouse Baner Pune';
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
  lb.focus();
}
function closeLb() { lb.classList.remove('open'); document.body.style.overflow = ''; }

document.getElementById('lbClose')?.addEventListener('click', closeLb);
lb?.addEventListener('click', e => { if (e.target === lb) closeLb(); });
document.getElementById('lbPrev')?.addEventListener('click', () => {
  lbIndex = (lbIndex - 1 + galleryImages.length) % galleryImages.length;
  lbImg.src = galleryImages[lbIndex].url;
});
document.getElementById('lbNext')?.addEventListener('click', () => {
  lbIndex = (lbIndex + 1) % galleryImages.length;
  lbImg.src = galleryImages[lbIndex].url;
});
document.addEventListener('keydown', e => {
  if (!lb?.classList.contains('open')) return;
  if (e.key === 'Escape')     closeLb();
  if (e.key === 'ArrowLeft')  document.getElementById('lbPrev').click();
  if (e.key === 'ArrowRight') document.getElementById('lbNext').click();
});

/* ═════════════════════════════
   REVIEWS
═════════════════════════════ */
async function loadReviews() {
  const scroll = document.getElementById('reviewsScroll');
  if (!scroll) return;

  const reviews = await api('/api/reviews') || [];

  if (!reviews.length) {
    scroll.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--muted);min-width:300px">
      No reviews yet — be the first to share your experience! 🎂</div>`;
    return;
  }

  scroll.innerHTML = reviews.map(r => `
    <div class="review-card" role="listitem">
      <div class="rv-stars" aria-label="${r.rating} out of 5 stars">
        ${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}
      </div>
      <p class="rv-text">"${r.message}"</p>
      <div class="rv-author">
        <strong>${r.name}</strong>
        <span>${r.source} · ${new Date(r.created_at).toLocaleDateString('en-IN', { month:'short', year:'numeric' })}</span>
      </div>
    </div>`).join('');
}

/* ─── Star rating ─── */
let selectedRating = 5;
const starsEl = document.getElementById('rfStars');
starsEl?.addEventListener('click', e => {
  const star = e.target.closest('i');
  if (!star) return;
  selectedRating = parseInt(star.dataset.val, 10);
  starsEl.querySelectorAll('i').forEach((s, i) => {
    const on = i < selectedRating;
    s.classList.toggle('active', on);
    s.setAttribute('aria-checked', String(on));
  });
});

document.getElementById('submitReview')?.addEventListener('click', async () => {
  const name = document.getElementById('rName').value.trim();
  const msg  = document.getElementById('rMsg').value.trim();
  if (!msg) { alert('Please share your experience!'); return; }

  const btn = document.getElementById('submitReview');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Submitting…';

  const res = await fetch('/api/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name || 'Anonymous', rating: selectedRating, message: msg }),
  }).catch(() => null);

  if (res?.ok) {
    document.getElementById('rName').value = '';
    document.getElementById('rMsg').value = '';
    await loadReviews();
    btn.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i> Thank you!';
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane" aria-hidden="true"></i> Submit Review';
    }, 3000);
  } else {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane" aria-hidden="true"></i> Submit Review';
    alert('Error submitting. Please try again.');
  }
});

/* ═════════════════════════════
   SMOOTH REVEAL ON SCROLL
═════════════════════════════ */
const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.style.opacity = '1';
      e.target.style.transform = 'translateY(0)';
      revealObserver.unobserve(e.target);
    }
  });
}, { threshold: .12, rootMargin: '0px 0px -40px 0px' });

function initReveal() {
  const els = document.querySelectorAll('.cake-card, .local-card, .faq-item, .review-card, .story-badge, .feature-card, .trust-item');
  els.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    el.style.transition = `opacity .5s ease ${(i % 4) * .08}s, transform .5s ease ${(i % 4) * .08}s`;
    revealObserver.observe(el);
  });
}

/* ═════════════════════════════
   INIT
═════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  // Initialise all data
  await Promise.all([
    loadTodaySpecial(),
    loadCakes(),
    loadGallery(),
    loadReviews(),
  ]);
  // Run reveal after content loads
  initReveal();
});
