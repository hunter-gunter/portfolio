/* Killian Frutieaux — moteur kinetic typography (sans dépendance).
   Le contenu est entièrement présent dans le HTML : ce script n'ajoute que le mouvement. */
(() => {
  'use strict';

  const d = document;
  const motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* Découpe le texte d'un élément en .word > .char.
     Le nom accessible est conservé via aria-label, les fragments sont masqués aux lecteurs d'écran. */
  const split = el => {
    if (!el.closest('[aria-label]')) {
      el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    }
    let i = 0;
    const walk = node => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === 1) { walk(child); continue; }
        if (child.nodeType !== 3) continue;
        const frag = d.createDocumentFragment();
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { frag.append(' '); continue; }
          const word = d.createElement('span');
          word.className = 'word';
          word.setAttribute('aria-hidden', 'true');
          for (const ch of part) {
            const c = d.createElement('span');
            c.className = 'char';
            c.textContent = ch;
            c.style.setProperty('--i', i++);
            word.append(c);
          }
          frag.append(word);
        }
        child.replaceWith(frag);
      }
    };
    walk(el);
    return [...el.querySelectorAll('.char')];
  };

  /* Ajuste la taille pour que le texte occupe toute la largeur à graisse maximale (900),
     ce qui garantit l'absence de débordement quelle que soit l'animation de graisse. */
  const measure = el => {
    const r = d.createRange();
    r.selectNodeContents(el);
    return r.getBoundingClientRect().width;
  };

  const fitAll = () => {
    for (const el of d.querySelectorAll('[data-fit], [data-scrub]')) {
      el.style.fontSize = '';
      el.classList.add('is-measuring');
      const cs = getComputedStyle(el);
      const avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const base = parseFloat(cs.fontSize);
      const width = measure(el);
      el.classList.remove('is-measuring');
      if (!width || !avail) continue;

      if (el.hasAttribute('data-fit')) {
        let max = parseFloat(el.dataset.fit) || Infinity;
        if (el.dataset.fitVh) max = Math.min(max, innerHeight * parseFloat(el.dataset.fitVh));
        el.style.fontSize = Math.min(max, (base * avail) / width * 0.985) + 'px';
      } else if (width > avail) {
        // Titres de section : on ne fait que réduire si nécessaire.
        el.style.fontSize = (base * avail) / width * 0.985 + 'px';
      }
    }
  };

  const style = d.createElement('style');
  style.textContent = '.is-measuring .char, .is-measuring { font-weight: 900 !important; }';
  d.head.append(style);

  /* --- Préparation ------------------------------------------------------ */

  const hero = d.querySelector('[data-hero]');
  if (hero) {
    split(hero);
    hero.classList.add('is-split');
  }

  const scrubs = [...d.querySelectorAll('[data-scrub]')].map(el => ({ el, chars: split(el), last: [] }));
  d.querySelectorAll('[data-split]').forEach(split);

  d.querySelectorAll('.skill__list').forEach(list => {
    [...list.children].forEach((li, i) => {
      li.style.setProperty('--i', i);
      // Double invisible en graisse 900 : la largeur est réservée, le survol ne renvoie plus à la ligne.
      li.dataset.label = li.textContent;
      const name = d.createElement('span');
      name.className = 'skill__name';
      name.append(...li.childNodes);
      li.append(name);
    });
  });

  fitAll();
  if (d.fonts && d.fonts.ready) d.fonts.ready.then(fitAll);
  let resizeT;
  addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(fitAll, 120);
  });

  /* --- Compteurs et ancienneté (valeur juste même sans mouvement) --------- */

  const counters = [...d.querySelectorAll('[data-count]')];
  counters.forEach(el => {
    if (el.dataset.since) {
      const [y, m] = el.dataset.since.split('-').map(Number);
      const now = new Date();
      const years = now.getFullYear() - y - (now.getMonth() + 1 < m ? 1 : 0);
      if (years > 0) el.textContent = String(years);
    }
  });

  /* --- Navigation : section active --------------------------------------- */

  const navLinks = [...d.querySelectorAll('.top__nav a[href^="#"]')];
  if ('IntersectionObserver' in window && navLinks.length) {
    const byId = new Map(navLinks.map(a => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        navLinks.forEach(a => a.classList.remove('is-active'));
        const a = byId.get(e.target.id);
        if (a) a.classList.add('is-active');
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    byId.forEach((_, id) => { const s = d.getElementById(id); s && io.observe(s); });
  }

  if (!motion) {
    d.querySelectorAll('[data-reveal]').forEach(el => el.classList.add('in'));
    return;
  }

  /* --- Apparitions ------------------------------------------------------- */

  // Compteur animé de sa valeur courante vers `to` ; un nouvel appel annule le précédent.
  const targets = new WeakMap(counters.map(el => [el, parseInt(el.textContent, 10) || 0]));
  const tweens = new WeakMap();
  const tweenCount = (el, to) => {
    const from = parseInt(el.textContent, 10) || 0;
    const token = {};
    tweens.set(el, token);
    if (from === to) return;
    const t0 = performance.now();
    const dur = to ? 1400 : 700;
    const step = t => {
      if (tweens.get(el) !== token) return;
      const p = clamp01((t - t0) / dur);
      el.textContent = String(Math.round(from + (to - from) * easeOut(p)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  // Réversible : un élément sorti de l'écran repasse à l'état caché, du côté par lequel il est sorti,
  // et rejoue l'apparition à son retour (à l'envers quand on remonte).
  const revealIO = new IntersectionObserver(entries => {
    for (const e of entries) {
      const el = e.target;
      const nums = el.querySelectorAll('[data-count]');
      if (e.isIntersecting) {
        el.classList.add('in');
        nums.forEach(n => tweenCount(n, targets.get(n)));
      } else {
        const above = e.rootBounds && e.boundingClientRect.bottom <= e.rootBounds.top;
        el.dataset.side = above ? 'above' : 'below';
        el.classList.remove('in');
        if (!above) nums.forEach(n => tweenCount(n, 0));
      }
    }
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });
  d.querySelectorAll('[data-reveal]').forEach(el => revealIO.observe(el));

  // Positions en cache : l'observateur ne signale pas un saut d'un côté à l'autre de l'écran
  // (clic dans le menu), la boucle recale donc le côté des éléments cachés.
  const reveals = [...d.querySelectorAll('[data-reveal]')].map(el => ({ el, bottom: 0 }));
  const measureReveals = () => reveals.forEach(r => { r.bottom = r.el.getBoundingClientRect().bottom + scrollY; });
  measureReveals();
  addEventListener('resize', measureReveals);
  addEventListener('load', measureReveals);
  if (d.fonts && d.fonts.ready) d.fonts.ready.then(measureReveals);

  /* --- Verbe tournant ---------------------------------------------------- */

  const slot = d.querySelector('.rot__slot');
  if (slot) {
    const words = slot.dataset.words.split('|');
    let idx = 0;
    const widthOf = node => node.getBoundingClientRect().width;
    slot.style.width = widthOf(slot.firstElementChild) + 'px';
    setInterval(() => {
      if (d.hidden) return;
      const old = slot.querySelector('.rot__word:not(.is-out)');
      idx = (idx + 1) % words.length;
      const next = d.createElement('span');
      next.className = 'rot__word is-in';
      next.textContent = words[idx];
      slot.append(next);
      slot.style.width = widthOf(next) + 'px';
      if (old) {
        old.classList.remove('is-in');
        old.classList.add('is-out');
        old.addEventListener('animationend', () => old.remove(), { once: true });
      }
    }, 1400);
    const syncWidth = () => {
      const cur = slot.querySelector('.rot__word:not(.is-out)');
      if (cur) slot.style.width = widthOf(cur) + 'px';
    };
    addEventListener('resize', syncWidth);
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(syncWidth);
  }

  /* --- Bandeau : duplication pour une boucle continue --------------------- */

  const rows = [...d.querySelectorAll('[data-marquee]')].map(row => {
    const track = row.querySelector('.marquee__track');
    const copies = Math.max(2, Math.ceil((innerWidth * 2) / Math.max(track.offsetWidth, 1)) + 1);
    for (let i = 1; i < copies; i++) row.append(track.cloneNode(true));
    return { row, track, dir: Number(row.dataset.marquee) || 1, x: 0, w: track.offsetWidth };
  });
  const measureRows = () => rows.forEach(r => { r.w = r.track.offsetWidth; });
  addEventListener('resize', measureRows);
  if (d.fonts && d.fonts.ready) d.fonts.ready.then(measureRows);

  /* --- Boucle unique ----------------------------------------------------- */

  let lastY = scrollY;
  let lastRevealY = -1;
  let vel = 0;
  let lastT = performance.now();

  const frame = t => {
    const dt = Math.min(64, t - lastT) / 16.67;
    lastT = t;
    const vh = innerHeight;

    // Lectures de mise en page d'abord, écritures ensuite : une seule mise en page par image.
    const scrubRects = scrubs.map(s => s.el.getBoundingClientRect());

    // Vitesse de défilement lissée.
    const y = scrollY;
    vel = lerp(vel, y - lastY, 0.12);
    lastY = y;

    // Bandeau.
    const skew = Math.max(-10, Math.min(10, vel * -0.35));
    for (const r of rows) {
      r.x -= (1.1 + Math.abs(vel) * 0.45) * r.dir * dt;
      if (r.w) {
        if (r.x <= -r.w) r.x += r.w;
        if (r.x > 0) r.x -= r.w;
      }
      r.row.style.transform = `translate3d(${r.x.toFixed(2)}px,0,0) skewX(${skew.toFixed(2)}deg)`;
    }

    // Côté des éléments cachés.
    if (y !== lastRevealY) {
      lastRevealY = y;
      for (const r of reveals) {
        if (r.el.classList.contains('in')) continue;
        const side = r.bottom < y ? 'above' : 'below';
        if (r.el.dataset.side === side) continue;
        r.el.dataset.side = side;
        if (side === 'below') r.el.querySelectorAll('[data-count]').forEach(n => tweenCount(n, 0));
      }
    }

    // Titres : la graisse suit la progression du défilement, lettre par lettre.
    for (let j = 0; j < scrubs.length; j++) {
      const s = scrubs[j];
      const r = scrubRects[j];
      if (r.bottom < -50 || r.top > vh + 50) continue;
      const p = clamp01((vh - r.top) / (vh * 0.5));
      const n = s.chars.length;
      for (let i = 0; i < n; i++) {
        const local = clamp01(p * 1.6 - (i / n) * 0.6);
        const w = Math.round(100 + 750 * easeOut(local));
        if (s.last[i] !== w) {
          s.chars[i].style.fontWeight = w;
          s.chars[i].style.opacity = (0.25 + 0.75 * local).toFixed(3);
          s.last[i] = w;
        }
      }
    }

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})();
