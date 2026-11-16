(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // iOS Safari's address and tab bars change the actually visible viewport
  // independently of CSS vh/svh. Keep section geometry tied to that live area.
  const syncVisibleViewportHeight = () => {
    const visualHeight = window.visualViewport?.height;
    const height = visualHeight && Number.isFinite(visualHeight) ? visualHeight : window.innerHeight;
    if (!height) return;
    document.documentElement.style.setProperty("--visible-viewport-height", `${Math.round(height)}px`);
  };

  let viewportSyncFrame = 0;
  const scheduleViewportHeightSync = () => {
    window.cancelAnimationFrame(viewportSyncFrame);
    viewportSyncFrame = window.requestAnimationFrame(syncVisibleViewportHeight);
  };

  syncVisibleViewportHeight();
  window.addEventListener("resize", scheduleViewportHeightSync, { passive: true });
  window.addEventListener("orientationchange", scheduleViewportHeightSync, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleViewportHeightSync, { passive: true });

  // Opening envelope: do not allow the page to be revealed before its image is available.
  const openingGate = $("#opening-gate");
  const openingButton = $("#opening-gate__button");
  const openingImage = $("#opening-gate__image");

  const setOpeningReady = () => {
    if (!openingGate || !openingButton) return;
    openingGate.classList.add("is-ready");
    openingButton.disabled = false;
  };

  if (openingImage?.complete && openingImage.naturalWidth > 0) setOpeningReady();
  else openingImage?.addEventListener("load", setOpeningReady, { once: true });

  openingButton?.addEventListener("click", () => {
    if (!openingGate || openingButton.disabled) return;
    openingButton.disabled = true;
    openingGate.classList.add("is-opening");
    audio?.play().catch(() => {});
    window.setTimeout(() => openingGate.remove(), 1410);
  });

  // Save-the-date scroll lock + confetti
  const stdSection = $("section.save-the-date");
  const stdScratches = $$("[data-scratch]");
  let stdCompleted = false;
  let stdConfettiFired = false;
  const userAgent = navigator.userAgent;
  const isSafariBrowser =
    /Safari/i.test(userAgent) &&
    !/(Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPiOS|Android)/i.test(userAgent);

  const SCROLL_KEYS = new Set([
    "ArrowUp",
    "ArrowDown",
    "PageUp",
    "PageDown",
    "Home",
    "End",
    " ",
  ]);

  const scrollLockState = {
    locked: false,
  };

  const preventScroll = (e) => {
    // Allow browser gestures inside inputs etc? Save-the-date has none; keep strict.
    e.preventDefault();
  };

  const onKeydownWhileLocked = (e) => {
    if (!SCROLL_KEYS.has(e.key)) return;
    e.preventDefault();
  };

  const lockScrollToSaveTheDate = () => {
    if (!stdSection || stdCompleted || scrollLockState.locked) return;
    scrollLockState.locked = true;

    document.body.classList.add("scroll-locked");

    window.addEventListener("wheel", preventScroll, { passive: false });
    window.addEventListener("touchmove", preventScroll, { passive: false });
    window.addEventListener("keydown", onKeydownWhileLocked, { passive: false });
  };

  const unlockScroll = () => {
    if (!scrollLockState.locked) return;
    scrollLockState.locked = false;

    window.removeEventListener("wheel", preventScroll);
    window.removeEventListener("touchmove", preventScroll);
    window.removeEventListener("keydown", onKeydownWhileLocked);

    document.body.classList.remove("scroll-locked");
  };

  // Treat the completed invitation as a sequence of pages rather than a free
  // scrolling document. This complements CSS scroll snapping for browsers
  // where wheel or swipe momentum can otherwise skip a page.
  const pageSections = $$([
    "main > section.invite-hero",
    "main > section.save-the-date",
    "main > section.countdown-venue-section",
    "main > section.details-section",
  ].join(", "));
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let sectionNavigationUntil = 0;
  let navigationTargetIndex = null;
  let wheelDirection = 0;
  let wheelDelta = 0;
  let wheelResetTimer = 0;
  let touchStartY = null;
  let touchStartPage = 0;
  let touchStartTop = 0;
  let touchIsDragging = false;

  const currentPageIndex = () => {
    const viewportMiddle = window.scrollY + (window.visualViewport?.height || window.innerHeight) / 2;
    let closestIndex = 0;
    let closestDistance = Infinity;

    pageSections.forEach((section, index) => {
      const middle = section.offsetTop + section.offsetHeight / 2;
      const distance = Math.abs(middle - viewportMiddle);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    return closestIndex;
  };

  const goToPage = (index) => {
    if (scrollLockState.locked || !pageSections.length) return false;
    const destination = pageSections[Math.max(0, Math.min(index, pageSections.length - 1))];
    if (!destination) return false;

    sectionNavigationUntil = performance.now() + 820;
    navigationTargetIndex = pageSections.indexOf(destination);
    destination.scrollIntoView({
      behavior: prefersReducedMotion.matches ? "auto" : "smooth",
      block: "start",
    });
    return true;
  };

  const movePage = (direction, fromIndex = currentPageIndex()) => {
    const nextIndex = Math.max(0, Math.min(fromIndex + direction, pageSections.length - 1));
    if (nextIndex === fromIndex) return false;
    return goToPage(nextIndex);
  };

  const resetWheelIntent = () => {
    wheelDirection = 0;
    wheelDelta = 0;
    wheelResetTimer = 0;
  };

  window.addEventListener("wheel", (event) => {
    if (scrollLockState.locked || event.ctrlKey || !event.deltaY) return;
    event.preventDefault();

    const direction = Math.sign(event.deltaY);
    if (performance.now() < sectionNavigationUntil) return;
    if (direction !== wheelDirection) {
      wheelDirection = direction;
      wheelDelta = 0;
    }

    wheelDelta += Math.abs(event.deltaY);
    window.clearTimeout(wheelResetTimer);
    wheelResetTimer = window.setTimeout(resetWheelIntent, 160);

    if (wheelDelta >= 36) {
      resetWheelIntent();
      movePage(direction);
    }
  }, { passive: false });

  // Let the page follow a finger while it moves, then glide precisely to the
  // adjacent page when released. Preventing the browser's kinetic scroll here
  // keeps one fast swipe from skipping multiple sections on Safari or Chrome.
  window.addEventListener("touchstart", (event) => {
    if (scrollLockState.locked || event.touches.length !== 1) return;
    touchStartY = event.touches[0].clientY;
    touchStartPage = currentPageIndex();
    touchStartTop = pageSections[touchStartPage]?.offsetTop || window.scrollY;
    touchIsDragging = false;
  }, { passive: true });

  window.addEventListener("touchmove", (event) => {
    if (scrollLockState.locked || touchStartY === null || event.touches.length !== 1) return;
    const distance = touchStartY - event.touches[0].clientY;
    if (!touchIsDragging && Math.abs(distance) < 8) return;

    touchIsDragging = true;
    if (event.cancelable) event.preventDefault();

    const direction = Math.sign(distance);
    const nextPage = Math.max(0, Math.min(touchStartPage + direction, pageSections.length - 1));
    const maxDistance = Math.min(window.innerHeight * .78, Math.abs(pageSections[nextPage]?.offsetTop - touchStartTop) || 0);
    const draggedDistance = Math.max(-maxDistance, Math.min(distance, maxDistance));
    window.scrollTo({ top: touchStartTop + draggedDistance, behavior: "auto" });
  }, { passive: false });

  window.addEventListener("touchend", (event) => {
    if (scrollLockState.locked || touchStartY === null || !event.changedTouches.length) return;
    const distance = touchStartY - event.changedTouches[0].clientY;
    const movedEnough = touchIsDragging && Math.abs(distance) >= Math.min(72, window.innerHeight * .13);
    const destination = movedEnough ? touchStartPage + Math.sign(distance) : touchStartPage;

    touchStartY = null;
    touchIsDragging = false;
    goToPage(destination);
  }, { passive: true });

  window.addEventListener("keydown", (event) => {
    if (scrollLockState.locked || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const active = document.activeElement;
    if (active?.matches("input, textarea, select, button, a") || active?.isContentEditable) return;

    const directions = {
      ArrowDown: 1,
      PageDown: 1,
      " ": 1,
      ArrowUp: -1,
      PageUp: -1,
    };
    if (event.key === "Home") {
      event.preventDefault();
      goToPage(0);
    } else if (event.key === "End") {
      event.preventDefault();
      goToPage(pageSections.length - 1);
    } else if (directions[event.key]) {
      event.preventDefault();
      movePage(directions[event.key]);
    }
  }, { passive: false });

  $$(".section-scroll-cue").forEach((cue) => {
    cue.addEventListener("click", (event) => {
      const target = $(cue.getAttribute("href"));
      const pageIndex = pageSections.indexOf(target);
      if (pageIndex < 0) return;
      event.preventDefault();
      goToPage(pageIndex);
    });
  });

  const burstConfettiFromTop = () => {
    if (stdConfettiFired) return;
    stdConfettiFired = true;
    if (isSafariBrowser) return;

    // Paper flutter inspired by Chris Gannon's https://codepen.io/chrisgannon/pen/qBPGEQy.
    // One drawing surface avoids offscreen CSS transform clipping/compositing issues.
    const layer = document.createElement("canvas");
    layer.className = "confetti-layer";
    layer.setAttribute("aria-hidden", "true");

    const brown = "#9A6A4A";
    const blushPink = "#E8B4C6";
    const rand = (min, max) => min + Math.random() * (max - min);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const count = window.matchMedia("(max-width: 767px)").matches ? 50 : 100;
    const colors = Array.from({ length: count }, (_, i) => i < count * .7 ? brown : blushPink);
    for (let i = colors.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [colors[i], colors[j]] = [colors[j], colors[i]];
    }
    const ctx = layer.getContext("2d");
    if (!ctx) return;
    const particles = colors.map(color => ({
      color, x: rand(.04, .96), startY: rand(.01, .09),
      drift: rand(-.18, .18), width: rand(6, 10), height: rand(8, 14),
      duration: rand(3.6, 5), delay: rand(0, .5),
      rotation: rand(0, Math.PI * 2), spin: rand(-1.4, 1.4), phase: rand(0, 6.28),
    }));
    // Show the first wave immediately, already inside the visible viewport.
    particles.slice(0, 10).forEach(p => { p.delay = 0; });
    let width, height, frame, previous = null, elapsed = 0;
    const resize = () => {
      const bounds = layer.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      layer.width = Math.round(width * dpr);
      layer.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        const age = elapsed - p.delay;
        const progress = age / p.duration;
        if (age < 0 || progress >= 1) continue;
        const fade = Math.max(0, (progress - .58) / .42);
        ctx.save();
        ctx.globalAlpha = 1 - fade * fade * (3 - 2 * fade);
        ctx.translate((p.x + p.drift * progress) * width + Math.sin(age * 3 + p.phase) * 7,
          (p.startY + progress * 1.05) * height);
        ctx.rotate(p.rotation + age * p.spin);
        ctx.scale(1, .12 + .88 * Math.abs(Math.cos(age * 9 + p.phase)));
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
        ctx.restore();
      }
    };
    const cleanup = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pagehide", cleanup);
      document.removeEventListener("visibilitychange", resetClock);
      layer.remove();
    };
    const resetClock = () => { previous = null; };
    const step = now => {
      // Start the clock on the first frame Safari actually paints, then use real
      // elapsed time so lower iPhone frame rates do not slow the fall to a crawl.
      if (!document.hidden && previous !== null) elapsed += Math.max(0, (now - previous) / 1000);
      previous = document.hidden ? null : now;
      draw();
      if (elapsed >= 5.5) cleanup();
      else frame = requestAnimationFrame(step);
    };
    document.body.appendChild(layer);
    resize();
    draw();
    window.addEventListener("resize", resize);
    window.addEventListener("pagehide", cleanup);
    document.addEventListener("visibilitychange", resetClock);
    frame = requestAnimationFrame(step);
  };

  // Reveal / motion
  const motionEls = $$("[data-motion]");
  motionEls.forEach((el) => {
    el.style.opacity = "0";
    el.style.transform = "translateY(20px)";
    el.style.transition = "opacity 600ms ease, transform 600ms ease";
    el.style.willChange = "opacity, transform";
  });

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target;
        el.style.opacity = "1";
        el.style.transform = "translateY(0)";
        io.unobserve(el);
      }
    },
    { threshold: 0.15 },
  );
  motionEls.forEach((el) => io.observe(el));

  // Smooth scroll to RSVP
  const scrollBtn = $("#scroll-to-rsvp");
  scrollBtn?.addEventListener("click", () => {
    $("#rsvp")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // Gifts accordion
  const giftToggle = $("#gift-toggle");
  const giftPanel = $("#gift-panel");
  giftToggle?.addEventListener("click", () => {
    const expanded = giftToggle.getAttribute("aria-expanded") === "true";
    giftToggle.setAttribute("aria-expanded", expanded ? "false" : "true");
    if (giftPanel) giftPanel.hidden = expanded;
  });

  // Background music begins from the envelope click, satisfying mobile
  // autoplay policies, and plays at 30% of the source file's full volume.
  const audio = $("audio");
  const heroVideo = $("section video");
  const muteBtn = $("#mute-toggle");
  const audioOnIcon = $('[data-audio-icon="on"]', muteBtn || document);
  const audioOffIcon = $('[data-audio-icon="off"]', muteBtn || document);
  let muted = audio?.muted || false;

  if (audio) audio.volume = 0.3;

  const applyMute = () => {
    if (audio) audio.muted = muted;
    if (heroVideo) heroVideo.muted = muted;
    muteBtn?.setAttribute("aria-label", muted ? "Unmute background music" : "Mute background music");
    muteBtn?.setAttribute("aria-pressed", String(muted));
    audioOnIcon?.toggleAttribute("hidden", muted);
    audioOffIcon?.toggleAttribute("hidden", !muted);
  };

  applyMute();
  audio?.addEventListener("volumechange", () => {
    muted = audio.muted;
    if (heroVideo) heroVideo.muted = muted;
    muteBtn?.setAttribute("aria-label", muted ? "Unmute background music" : "Mute background music");
    muteBtn?.setAttribute("aria-pressed", String(muted));
    audioOnIcon?.toggleAttribute("hidden", muted);
    audioOffIcon?.toggleAttribute("hidden", !muted);
  });
  muteBtn?.addEventListener("click", () => {
    muted = !muted;
    applyMute();
    if (!muted) audio?.play().catch(() => {});
  });

  // Countdown to the date declared by the invitation section.
  // The explicit +05:00 offset keeps the wedding date anchored to Pakistan time.
  const countdownSection = $(".countdown-venue-section");
  const target = new Date(countdownSection?.dataset.countdownTarget || "2027-06-19T00:00:00+05:00");
  const out = {
    days: $('[data-countdown="days"]'),
    hours: $('[data-countdown="hours"]'),
    minutes: $('[data-countdown="minutes"]'),
    seconds: $('[data-countdown="seconds"]'),
  };

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function tick() {
    const now = new Date();
    let diff = Math.max(0, target.getTime() - now.getTime());
    const sec = Math.floor(diff / 1000);
    const days = Math.floor(sec / 86400);
    const hours = Math.floor((sec % 86400) / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = sec % 60;

    if (out.days) out.days.textContent = String(days);
    if (out.hours) out.hours.textContent = pad2(hours);
    if (out.minutes) out.minutes.textContent = pad2(minutes);
    if (out.seconds) out.seconds.textContent = pad2(seconds);
  }
  tick();
  setInterval(tick, 1000);

  // Save-the-date scratch reveal
  function setupScratch(el) {
    const canvas = el.querySelector("canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Layered warm-taupe paper cover matching the Save-the-Date palette.

    function resizeCanvasToCssPixels() {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      // draw in CSS pixel space
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawCover() {
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const r = canvas.getBoundingClientRect();

      // A gentle paper gradient prevents the scratch surface from looking flat.
      const base = ctx.createLinearGradient(0, 0, r.width, r.height);
      base.addColorStop(0, "#E4D4C0");
      base.addColorStop(0.52, "#D8C5AE");
      base.addColorStop(1, "#CDB391");
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, r.width, r.height);

      const highlight = ctx.createRadialGradient(
        r.width * 0.28,
        r.height * 0.2,
        1,
        r.width * 0.48,
        r.height * 0.48,
        r.width * 0.78,
      );
      highlight.addColorStop(0, "rgb(255 255 255 / .34)");
      highlight.addColorStop(0.55, "rgb(255 255 255 / .08)");
      highlight.addColorStop(1, "rgb(255 255 255 / 0)");
      ctx.fillStyle = highlight;
      ctx.fillRect(0, 0, r.width, r.height);

      // Fine, low-contrast flecks mimic the invitation's paper texture.
      const speckCount = Math.max(45, Math.round((r.width * r.height) / 34));
      for (let i = 0; i < speckCount; i++) {
        const size = Math.random() < 0.88 ? 0.45 : 0.8;
        ctx.fillStyle = Math.random() < 0.5 ? "rgb(90 52 26 / .045)" : "rgb(255 255 255 / .13)";
        ctx.beginPath();
        ctx.arc(Math.random() * r.width, Math.random() * r.height, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    resizeCanvasToCssPixels();
    drawCover();

    let scratching = false;
    let revealed = false;
    let lastCheck = 0;
    let lastPt = null;

    // Track brush coverage on a small logical grid without synchronous GPU pixel readbacks.
    const coverage = new Uint8Array(400);
    let covered = 0;
    const markCoverage = (from, to, width, height) => {
      const dx = to.x - from.x, dy = to.y - from.y;
      const length2 = dx * dx + dy * dy;
      for (let i = 0; i < coverage.length; i++) {
        if (coverage[i]) continue;
        const x = ((i % 20) + .5) * width / 20;
        const y = (Math.floor(i / 20) + .5) * height / 20;
        const t = length2 ? Math.max(0, Math.min(1, ((x - from.x) * dx + (y - from.y) * dy) / length2)) : 0;
        if ((x - from.x - t * dx) ** 2 + (y - from.y - t * dy) ** 2 <= ERASER_RADIUS ** 2) {
          coverage[i] = 1;
          covered++;
        }
      }
    };

    const ERASER_RADIUS = 26; // bigger = less effort
    const brushDot = (x, y) => {
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(x, y, ERASER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    };

    const brushStroke = (fromX, fromY, toX, toY) => {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = ERASER_RADIUS * 2;
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();
      brushDot(toX, toY);
    };

    const pos = (evt) => {
      const r = canvas.getBoundingClientRect();
      const x = ("clientX" in evt ? evt.clientX : evt.touches?.[0]?.clientX) - r.left;
      const y = ("clientY" in evt ? evt.clientY : evt.touches?.[0]?.clientY) - r.top;
      return { x, y, w: r.width, h: r.height };
    };

    const maybeReveal = (now, force = false) => {
      if (revealed) return;
      if (!force && now - lastCheck < 120) return;
      lastCheck = now;

      const clearedRatio = covered / coverage.length;
      if (clearedRatio >= 0.3) {
        revealed = true;
        // auto-vanish the remaining cover once 30% is scratched
        try {
          ctx.globalCompositeOperation = "destination-out";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } catch {}

        canvas.style.transition = "opacity 180ms ease";
        canvas.style.opacity = "0";
        window.setTimeout(() => canvas.remove(), 190);
        el.classList.add("is-revealed");

        // If all three are revealed: celebrate + release scroll.
        if (!stdCompleted && stdScratches.length) {
          const allRevealed = stdScratches.every((s) => s.classList.contains("is-revealed"));
          if (allRevealed) {
            stdCompleted = true;
            // onUp releases the scroll lock and celebrates after the gesture finishes.
          }
        }
      }
    };

    const onDown = (e) => {
      if (revealed) return;
      scratching = true;
      canvas.setPointerCapture?.(e.pointerId);
      const p = pos(e);
      lastPt = { x: p.x, y: p.y };
      brushDot(p.x, p.y);
      markCoverage(p, p, p.w, p.h);
      maybeReveal(performance.now());
    };
    const onMove = (e) => {
      if (!scratching || revealed) return;
      const p = pos(e);
      markCoverage(lastPt || p, p, p.w, p.h);
      if (lastPt) brushStroke(lastPt.x, lastPt.y, p.x, p.y);
      else brushDot(p.x, p.y);
      lastPt = { x: p.x, y: p.y };
      maybeReveal(performance.now());
    };
    const onUp = () => {
      if (!scratching) return;
      maybeReveal(performance.now(), true);
      scratching = false;
      lastPt = null;
      if (stdCompleted) {
        unlockScroll();
        requestAnimationFrame(() => requestAnimationFrame(burstConfettiFromTop));
      }
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    window.addEventListener("resize", () => {
      if (revealed || !document.body.contains(canvas)) return;
      coverage.fill(0);
      covered = 0;
      resizeCanvasToCssPixels();
      drawCover();
    });
  }

  $$("[data-scratch]").forEach(setupScratch);

  // Lock only when the Save-the-Date page itself is the active, aligned page.
  // A smooth jump across it or a restored position farther down must not trap
  // the visitor because its card briefly passes through the viewport.
  if (stdSection) {
    const isStdActive = () => {
      const rect = stdSection.getBoundingClientRect();
      const visibleHeight = window.visualViewport?.height || window.innerHeight;
      const tolerance = Math.min(12, visibleHeight * .02);
      return currentPageIndex() === pageSections.indexOf(stdSection) &&
        Math.abs(rect.top) <= tolerance && rect.bottom >= visibleHeight - tolerance;
    };

    let rafPending = false;
    const checkAndLock = () => {
      if (!isStdActive()) {
        if (scrollLockState.locked) unlockScroll();
        return;
      }
      if (stdCompleted || scrollLockState.locked) return;
      if (performance.now() < sectionNavigationUntil && navigationTargetIndex !== pageSections.indexOf(stdSection)) return;
      lockScrollToSaveTheDate();
    };

    const onScrollOrResize = () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        checkAndLock();
      });
    };

    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize, { passive: true });
    window.visualViewport?.addEventListener("resize", onScrollOrResize, { passive: true });
    onScrollOrResize();
  }

  // RSVP form (local-only demo behavior)
  const form = $("#rsvp-form");
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    window.setTimeout(() => {
      if (btn) btn.disabled = false;
      form.reset();
      // Keep attendance default checked
      const yes = form.querySelector('input[type="radio"][name="attendance"][value="yes"]');
      if (yes) yes.checked = true;
      alert("Thanks! Your RSVP has been recorded.");
    }, 400);
  });
})();

