(() => {
  'use strict';

  const root = document.documentElement;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animated = Array.from(document.querySelectorAll('[data-anim]'));
  const parallaxEls = Array.from(document.querySelectorAll('[data-parallax]'));

  /* ---------- счётчики: цифры отсчитываются с нуля при появлении ---------- */
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  const runCounter = (el, delay) => {
    const end = parseInt(el.dataset.count, 10);
    if (!end || el.dataset.counted) return;
    el.dataset.counted = '1';
    // ширина фиксируется по итоговому числу, чтобы строка не прыгала.
    // offsetWidth не зависит от transform, поэтому замер верный даже во время
    // анимации появления «pop» (scale .6 → 1), как у цифры «4»
    const width = el.offsetWidth;
    const fontSize = parseFloat(getComputedStyle(el).fontSize) || 1;
    el.classList.add('is-counting');
    el.style.width = `${width / fontSize}em`;
    el.textContent = '0';
    const duration = 1400;
    setTimeout(() => {
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min((now - t0) / duration, 1);
        el.textContent = String(Math.round(end * easeOut(p)));
        if (p < 1) {
          requestAnimationFrame(step);
        } else {
          el.textContent = String(end);
          el.classList.remove('is-counting');
          el.style.width = '';
        }
      };
      requestAnimationFrame(step);
    }, Math.max(0, delay + 150));
  };

  const startCounters = (el, delay) => {
    el.querySelectorAll('[data-count]').forEach((c) => runCounter(c, delay));
  };

  /* ---------- появление при прокрутке ---------- */
  const showAll = () => animated.forEach((el) => el.classList.add('is-in'));

  // Секции открываются строго по очереди: следующая начинает появляться только
  // после того, как предыдущая открылась полностью. Внутри секции элементы идут
  // каскадом сверху вниз, текст в салатовой плашке — после самой плашки.
  // Видимость проверяется по getBoundingClientRect: он не учитывает clip-path,
  // поэтому элементы с анимацией «прорисовки» тоже корректно появляются.
  const REVEAL_TIME = 900;   // длительность появления одного элемента, мс
  const CASCADE_MAX = 1200;  // весь каскад внутри секции укладывается в это время
  const TEXT_AFTER_BOX = 650; // текст в плашке стартует, когда плашка почти выехала

  const sections = Array.from(document.querySelectorAll('.sec')).map((sec) => ({
    sec,
    items: animated.filter((el) => el.closest('.sec') === sec),
    state: 'closed', // closed → opening → open
  }));
  let revealQueued = false;

  const openSection = (s, instant) => {
    s.state = 'opening';
    const items = s.items
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left)
      .map(({ el }) => el);

    // секция, которую пролистали не глядя, открывается сразу, без анимации
    if (instant) {
      items.forEach((el) => {
        el.style.transitionDuration = '0s';
        el.style.setProperty('--d', '0ms');
        el.classList.add('is-in');
      });
      requestAnimationFrame(() => items.forEach((el) => { el.style.transitionDuration = ''; }));
      s.state = 'open';
      return;
    }

    const step = Math.min(90, CASCADE_MAX / Math.max(items.length, 1));
    let last = 0;
    items.forEach((el, i) => {
      let delay = Math.round(i * step);
      if (el.classList.contains('box__text')) {
        const box = el.closest('.box');
        delay = Math.max(delay, (box ? Number(box.dataset.delay || 0) : 0) + TEXT_AFTER_BOX);
      }
      el.dataset.delay = String(delay);
      el.style.setProperty('--d', `${delay}ms`);
      el.classList.add('is-in');
      startCounters(el, delay);
      last = Math.max(last, delay);
    });

    setTimeout(() => {
      s.state = 'open';
      queueReveal();
    }, last + REVEAL_TIME);
  };

  const checkReveal = () => {
    revealQueued = false;
    const vh = window.innerHeight;
    for (let i = 0; i < sections.length; i += 1) {
      const s = sections[i];
      if (s.state === 'open') continue;
      if (s.state === 'opening') break; // ждём, пока откроется текущая
      const r = s.sec.getBoundingClientRect();
      if (r.bottom <= 0) {
        openSection(s, true); // секция уже выше экрана
        continue;
      }
      if (r.top < vh * 0.85) openSection(s, false);
      break; // следующая секция ждёт своей очереди
    }
    if (sections.every((s) => s.state === 'open')) stopReveal();
  };

  const queueReveal = () => {
    if (!revealQueued) {
      revealQueued = true;
      requestAnimationFrame(checkReveal);
    }
  };

  const stopReveal = () => {
    window.removeEventListener('scroll', queueReveal);
    window.removeEventListener('resize', queueReveal);
  };

  const initReveal = () => {
    if (motion.matches) {
      showAll();
      return;
    }
    window.addEventListener('scroll', queueReveal, { passive: true });
    window.addEventListener('resize', queueReveal);
    queueReveal();
  };

  /* ---------- параллакс декоративных элементов ---------- */
  let items = [];
  let ticking = false;

  const measure = () => {
    items = parallaxEls.map((el) => {
      el.style.translate = '';
      const rect = el.getBoundingClientRect();
      return {
        el,
        factor: parseFloat(el.dataset.parallax) || 0,
        center: rect.top + window.scrollY + rect.height / 2,
      };
    });
  };

  const update = () => {
    ticking = false;
    const viewCenter = window.scrollY + window.innerHeight / 2;
    const limit = Math.min(window.innerWidth, 1440) * 0.03;
    const scale = window.innerWidth < 900 ? 0.5 : 1;
    items.forEach(({ el, factor, center }) => {
      const shift = (center - viewCenter) * factor * scale;
      const y = Math.max(-limit, Math.min(limit, shift));
      el.style.translate = `0 ${y.toFixed(1)}px`;
    });
  };

  const requestUpdate = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };

  const onScroll = () => requestUpdate();
  const onResize = () => { measure(); requestUpdate(); };

  const enableParallax = () => {
    measure();
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
  };

  const disableParallax = () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    parallaxEls.forEach((el) => { el.style.translate = ''; });
  };

  /* ---------- интерактив: перетаскивание ---------- */
  const spring = 'cubic-bezier(.34, 1.56, .64, 1)';

  const initDrag = () => {
    document.querySelectorAll('[data-drag]').forEach((el) => {
      let startX = 0;
      let startY = 0;
      let dragging = false;
      let returnTimer = 0;

      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        clearTimeout(returnTimer);
        try {
          el.setPointerCapture(e.pointerId);
        } catch (err) {
          /* захват недоступен — перетаскивание работает и без него */
        }
        el.classList.add('is-dragging');
        el.style.transition = 'none';
        e.preventDefault();
      });

      el.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        el.style.translate = `${e.clientX - startX}px ${e.clientY - startY}px`;
      });

      // после отпускания элемент пружинит на своё место
      const release = () => {
        if (!dragging) return;
        dragging = false;
        const finish = () => {
          el.classList.remove('is-dragging');
          el.style.transition = '';
          el.style.translate = '';
        };
        if (motion.matches) {
          finish();
          return;
        }
        el.style.transition = `translate .75s ${spring}`;
        el.style.translate = '0px 0px';
        returnTimer = setTimeout(finish, 780);
      };

      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
    });
  };

  /* ---------- интерактив: нажатия ---------- */
  const tapActions = {
    // обложка переворачивается
    flip: (el) => {
      if (motion.matches || !el.animate) return;
      el.animate(
        [{ transform: 'perspective(900px) rotateY(0deg)' }, { transform: 'perspective(900px) rotateY(360deg)' }],
        { duration: 800, easing: 'cubic-bezier(.2, .7, .2, 1)' }
      );
    },
    // цифра отсчитывается заново
    recount: (el) => {
      el.querySelectorAll('[data-count]').forEach((c) => {
        if (c.classList.contains('is-counting')) return;
        delete c.dataset.counted;
        if (motion.matches) return;
        runCounter(c, -150);
      });
      if (!motion.matches && el.animate) {
        el.animate([{ scale: 1 }, { scale: 1.06 }, { scale: 1 }], { duration: 450, easing: 'ease-out' });
      }
    },
    // логотип делает оборот (работает и от касания на телефоне)
    spin: (el) => {
      if (motion.matches || !el.animate) return;
      el.animate([{ rotate: '0deg' }, { rotate: '360deg' }], { duration: 900, easing: 'cubic-bezier(.2, .7, .2, 1)' });
    },
    // стопка пластинок раскладывается веером и собирается обратно
    spread: () => {
      const section = document.querySelector('.sec--final');
      const stack = document.querySelector('.final__stack');
      const open = section.classList.toggle('is-spread');
      if (stack) stack.setAttribute('aria-pressed', String(open));
    },
  };

  // слово в колонках дизайна показывает свой смысл (эффект описан в CSS)
  tapActions.fx = (el) => {
    if (motion.matches) return;
    el.classList.remove('fx');
    void el.offsetWidth; // перезапуск анимации при повторном нажатии
    el.classList.add('fx');
    el.addEventListener('animationend', () => el.classList.remove('fx'), { once: true });
  };

  // этап 1–5 отмечается как пройденный
  tapActions.step = (el) => {
    el.classList.toggle('is-done');
    const box = el.querySelector('.step__box');
    if (!motion.matches && box && box.animate) {
      box.animate([{ scale: 1 }, { scale: 0.94 }, { scale: 1 }], { duration: 350, easing: 'ease-out' });
    }
  };

  // «1%» пульсирует
  tapActions.pulse = (el) => {
    if (motion.matches || !el.animate) return;
    el.animate([{ scale: 1 }, { scale: 1.14 }, { scale: 1 }, { scale: 1.07 }, { scale: 1 }], { duration: 750, easing: 'ease-out' });
  };

  const initTaps = () => {
    document.querySelectorAll('[data-tap]').forEach((el) => {
      const action = tapActions[el.dataset.tap];
      if (!action) return;
      el.addEventListener('click', () => action(el));
      if (el.getAttribute('role') === 'button') {
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            action(el);
          }
        });
      }
    });
  };

  /* ---------- интерактив: движение за курсором (только мышь) ---------- */
  const relPos = (e, el) => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2)),
      y: Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2)),
    };
  };

  const initPointerFollow = () => {
    // обложка «Wrapped 2026»: слои смещаются с разной глубиной
    const hero = document.querySelector('.sec--hero');
    if (hero) {
      hero.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse' || motion.matches) return;
        const p = relPos(e, hero);
        hero.style.setProperty('--mx', p.x.toFixed(3));
        hero.style.setProperty('--my', p.y.toFixed(3));
      });
      hero.addEventListener('pointerleave', () => {
        hero.style.setProperty('--mx', '0');
        hero.style.setProperty('--my', '0');
      });
    }

    // карточки артистов наклоняются в 3D
    document.querySelectorAll('.card').forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse' || motion.matches || !card.classList.contains('is-in')) return;
        const p = relPos(e, card);
        card.style.transition = 'transform .15s ease-out, scale .45s var(--ease)';
        card.style.transform = `perspective(700px) rotateX(${(-p.y * 10).toFixed(2)}deg) rotateY(${(p.x * 12).toFixed(2)}deg)`;
      });
      card.addEventListener('pointerleave', () => {
        if (!card.style.transform) return;
        card.style.transition = 'transform .6s var(--ease), scale .45s var(--ease)';
        card.style.transform = '';
      });
    });

    // шестиугольники тянутся за курсором
    const algo = document.querySelector('.sec--algo');
    const hex = document.querySelector('.algo__hex');
    if (algo && hex) {
      algo.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse' || motion.matches || !hex.classList.contains('is-in')) return;
        const p = relPos(e, algo);
        hex.style.transition = 'opacity .9s var(--ease), transform 1.1s var(--ease)';
        hex.style.transform = `translate(${(p.x * 26).toFixed(1)}px, ${(p.y * 20).toFixed(1)}px)`;
      });
      algo.addEventListener('pointerleave', () => {
        hex.style.transform = '';
      });
    }
  };

  /* ---------- запуск ---------- */
  const start = () => {
    initDrag();
    initTaps();
    initPointerFollow();
    initReveal();
    if (!motion.matches) enableParallax();
  };

  motion.addEventListener('change', () => {
    if (motion.matches) {
      sections.forEach((sec) => { sec.state = 'open'; });
      stopReveal();
      showAll();
      disableParallax();
    } else {
      enableParallax();
    }
  });

  // пересчёт позиций после загрузки шрифтов и изображений
  window.addEventListener('load', () => { if (!motion.matches) onResize(); });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { if (!motion.matches) onResize(); });
  }

  if (root.classList.contains('js')) start();
})();
