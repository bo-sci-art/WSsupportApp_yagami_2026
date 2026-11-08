// tour.js - Updated for center positioning
import { GUIDE } from "./tour-config.js";

const LS = { done: id => `tour.${id}.done` };

class Tour {
  constructor() {
    this.chapters = GUIDE.chapters || [];
    this.ci = 0;
    this.si = 0;
    this.active = false;

    // UI refs
    this.overlay = null;
    this.dimmer = null;
    this.pop = null;
    this.outlineLayer = null;
    this.outlines = [];

    this.cleanupFns = [];
    this.keyHandler = this.onKey.bind(this);
  }

  start(chapterId = null) {
    if (chapterId) {
      this.ci = this.chapters.findIndex(c => c.id === chapterId);
      if (this.ci < 0) this.ci = 0;
    } else {
      this.ci = 0;
      for (let i = 0; i < this.chapters.length; i++) {
        if (!localStorage.getItem(LS.done(this.chapters[i].id))) { this.ci = i; break; }
      }
    }
    this.si = 0;
    this.active = true;
    this.buildUI();
    document.addEventListener("keydown", this.keyHandler);
    this.runStep();
  }

  end() {
    this.active = false;
    document.removeEventListener("keydown", this.keyHandler);
    this.teardownUI();
  }

  skip() {
    const chapter = this.chapters[this.ci];
    if (chapter?.id) localStorage.setItem(LS.done(chapter.id), "1");
    this.end();
  }

  nextChapter() {
    this.si = 0;
    this.ci++;
    if (this.ci >= this.chapters.length) return this.end();
    this.runStep();
  }

  nextStep() {
    const chapter = this.chapters[this.ci];
    this.si++;
    if (this.si >= chapter.steps.length) {
      if (chapter?.id) localStorage.setItem(LS.done(chapter.id), "1");
      return this.nextChapter();
    }
    this.runStep();
  }

  canPrev() {
    return !(this.ci === 0 && this.si === 0);
  }
  
  prevStep() {
    this.clearStep();
    if (this.si > 0) {
      this.si--;
    } else if (this.ci > 0) {
      this.ci--;
      const prevChapter = this.chapters[this.ci];
      this.si = prevChapter.steps.length - 1;
    }
    this.runStep();
  }

  runStep() {
    this.clearStep();
    const chapter = this.chapters[this.ci];
    const step = chapter.steps[this.si];

    // ターゲット解決
    let targets = [];
    const hasSelectors = Array.isArray(step.targets) || !!step.target;

    if (hasSelectors) {
      const sels = Array.isArray(step.targets) ? step.targets : [step.target];
      targets = sels.map(sel => document.querySelector(sel)).filter(Boolean);

      if (targets.length === 0) {
        let tries = 0;
        const timer = setInterval(() => {
          tries++;
          targets = sels.map(sel => document.querySelector(sel)).filter(Boolean);
          if (targets.length || tries > 20) {
            clearInterval(timer);
            if (targets.length) {
              try { targets[0].scrollIntoView({ block: "center", inline: "center" }); } catch {}
              this.highlight(targets, step.box === "multi" ? "multi" : "union");
            } else {
              this.nextStep();
            }
          }
        }, 50);
      } else {
        try { targets[0].scrollIntoView({ block: "center", inline: "center" }); } catch {}
        this.highlight(targets, step.box === "multi" ? "multi" : "union");
      }
    }

    // UI表示
    this.showOverlay();
    this.showPopover(step.content, {
      showSkip: true,
      onNext: () => this.nextStep(),
      onSkip: () => this.skip(),
    });

    if (targets.length) this.highlight(targets, step.box === "multi" ? "multi" : "union");

    // 進行条件
    const adv = step.advance || { mode: "next" };
    switch (adv.mode) {
      case "next": break;
      case "click-cta": break;
      case "click": {
        const el = document.querySelector(adv.selector || (step.targets ? step.targets[0] : step.target));
        if (el) {
          const h = () => { el.removeEventListener("click", h); this.nextStep(); };
          el.addEventListener("click", h, { once: true });
          this.cleanupFns.push(() => el.removeEventListener("click", h));
        } else {
          this.nextStep();
        }
        break;
      }
      case "event": {
        const h = () => { document.removeEventListener(adv.name, h); this.nextStep(); };
        document.addEventListener(adv.name, h, { once: true });
        this.cleanupFns.push(() => document.removeEventListener(adv.name, h));
        if (adv.fallbackClickSelector) {
          const el = document.querySelector(adv.fallbackClickSelector);
          if (el) {
            const hc = () => { el.removeEventListener("click", hc); this.nextStep(); };
            el.addEventListener("click", hc, { once: true });
            this.cleanupFns.push(() => el.removeEventListener("click", hc));
          }
        }
        break;
      }
      case "timer": {
        const id = setTimeout(() => this.nextStep(), adv.ms || 1000);
        this.cleanupFns.push(() => clearTimeout(id));
        break;
      }
      case "either": {
        let advanced = false;
        const done = () => { if (advanced) return; advanced = true; this.nextStep(); };
        if (adv.events) {
          const hs = adv.events.map(n => {
            const h = () => done();
            document.addEventListener(n, h, { once: true });
            return () => document.removeEventListener(n, h);
          });
          this.cleanupFns.push(...hs);
        }
        if (adv.timerMs) {
          const id = setTimeout(done, adv.timerMs);
          this.cleanupFns.push(() => clearTimeout(id));
        }
        if (adv.onClickSelector) {
          const el = document.querySelector(adv.onClickSelector);
          if (el) {
            const hc = () => done();
            el.addEventListener("click", hc, { once: true });
            this.cleanupFns.push(() => el.removeEventListener("click", hc));
          }
        }
        break;
      }
      case "gate": {
        this.setGateEnabled(false);
        let unlocked = false;
        const done = () => { if (unlocked) return; unlocked = true; this.setGateEnabled(true); };
        const cleanups = [];
        if (adv.events && adv.events.length) {
          adv.events.forEach(name => {
            const h = () => done();
            document.addEventListener(name, h, { once: true });
            cleanups.push(() => document.removeEventListener(name, h));
          });
        }
        if (adv.clickSelector) {
          const el = document.querySelector(adv.clickSelector);
          if (el) {
            const hc = () => done();
            el.addEventListener("click", hc, { once: true });
            cleanups.push(() => el.removeEventListener("click", hc));
          }
        }
        this.cleanupFns.push(() => cleanups.splice(0).forEach(fn => { try{fn()}catch{} }));
        break;
      }
    }
  }

  // ===== UI構築 =====
  buildUI() {
    document.documentElement.dataset.tourScroll = "locked";
    document.body.style.overflow = "hidden";

    this.overlay = document.createElement("div");
    this.overlay.className = "tour-overlay";
    document.body.appendChild(this.overlay);

    this.dimmer = document.createElement("div");
    this.dimmer.className = "tour-dimmer";
    document.body.appendChild(this.dimmer);

    this.pop = document.createElement("div");
    this.pop.className = "tour-popover";
    this.pop.innerHTML = `
      <button class="tour-popover__skip" data-act="skip" aria-label="終了">終<ruby>了<rt>りょう</rt></ruby></button>
      
      <div class="tour-popover__title"></div>
      <div class="tour-popover__body"></div>
      
      <div class="tour-popover__actions">
        <button data-act="prev"><ruby>戻<rt>もど</rt></ruby>る</button>
        <div class="tour-popover__indicator" aria-live="polite"></div>
        <button data-act="next">次へ</button>
      </div>
    `;
    document.body.appendChild(this.pop);

    this.outlineLayer = document.createElement("div");
    this.outlineLayer.className = "tour-outline-layer";
    document.body.appendChild(this.outlineLayer);
    this.outlines = [];
  }

  teardownUI() {
    document.body.style.overflow = "";
    delete document.documentElement.dataset.tourScroll;
    this.overlay?.remove();
    this.dimmer?.remove();
    this.pop?.remove();
    this.outlineLayer?.remove();
    this.overlay = this.dimmer = this.pop = this.outlineLayer = null;
  }

  showOverlay() {
    if (this.overlay) this.overlay.style.display = "block";
  }

  showPopover(content, { showSkip, onNext, onSkip }) {
    // コンテンツ設定
    this.pop.querySelector(".tour-popover__title").innerHTML = content?.title || "";
    this.pop.querySelector(".tour-popover__body").innerHTML = content?.body || "";

    const btnPrev = this.pop.querySelector('button[data-act="prev"]');
    const btnNext = this.pop.querySelector('button[data-act="next"]');
    const btnSkip = this.pop.querySelector('button[data-act="skip"]');
    const indicator = this.pop.querySelector(".tour-popover__indicator");

    // 進捗インジケーター
    const totalSteps = this.chapters.reduce((sum, c) => sum + (c.steps?.length || 0), 0);
    const doneBefore = this.chapters
      .slice(0, this.ci)
      .reduce((sum, c) => sum + (c.steps?.length || 0), 0);

    const current = doneBefore + (this.si + 1);

    if (indicator && totalSteps > 0) {
      indicator.textContent = `${current} / ${totalSteps}`;
    }

    // ボタンイベント
    btnNext.onclick = onNext;
    btnSkip.onclick = onSkip;

    if (this.canPrev()) {
      btnPrev.disabled = false;
      btnPrev.onclick = () => this.prevStep();
    } else {
      btnPrev.disabled = true;
      btnPrev.onclick = null;
    }

    btnSkip.style.display = showSkip ? "" : "none";

    // ポップアップを中央に配置（CSSで制御、念のためJS側でも明示）
    this.pop.style.position = "fixed";
    this.pop.style.top = "50%";
    this.pop.style.left = "50%";
    this.pop.style.transform = "translate(-50%, -50%)";
    this.pop.style.bottom = ""; // 下固定を解除
    
    // 表示クラスを追加（アニメーション用）
    this.pop.style.display = "block";
    // 次のフレームでis-openを追加してアニメーション発火
    requestAnimationFrame(() => {
      this.pop.classList.add("is-open");
    });
  }

  // 複数要素の外接矩形
  unionRect(els) {
    let top = Infinity, left = Infinity, right = -Infinity, bottom = -Infinity;
    els.forEach(el => {
      const r = el.getBoundingClientRect();
      top = Math.min(top, r.top);
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    });
    return { top, left, width: right - left, height: bottom - top };
  }

  positionOutlineEl(el, rect, pad = 8) {
    Object.assign(el.style, {
      display: "block",
      position: "fixed",
      top: `${rect.top - pad}px`,
      left: `${rect.left - pad}px`,
      width: `${rect.width + pad * 2}px`,
      height: `${rect.height + pad * 2}px`,
      zIndex: 10001,
      pointerEvents: "none"
    });
  }

  // ハイライト: union（1つの枠）または multi（複数枠）
  highlight(targetOrArray, mode = "union") {
    const els = Array.isArray(targetOrArray) ? targetOrArray : [targetOrArray];

    if (this.outlineLayer) this.outlineLayer.innerHTML = "";
    this.outlines = [];

    if (mode === "multi") {
      this.outlines = els.map(el => {
        const box = document.createElement("div");
        box.className = "tour-outline";
        this.outlineLayer.appendChild(box);
        this.positionOutlineEl(box, el.getBoundingClientRect());
        return box;
      });
      this.setDimmerHoles(this.getRects(els));

      const apply = () => {
        const rects = this.getRects(els);
        this.outlines.forEach((box, i) => this.positionOutlineEl(box, rects[i]));
        this.setDimmerHoles(rects);
      };
      const onScroll = () => apply();
      const onResize = () => apply();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onResize);
      this.cleanupFns.push(() => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onResize);
      });

    } else {
      const rect = this.unionRect(els);
      const box = document.createElement("div");
      box.className = "tour-outline";
      this.outlineLayer.appendChild(box);
      this.positionOutlineEl(box, rect);
      this.setDimmerHoles([rect]);

      const apply = () => {
        const r = this.unionRect(els);
        this.positionOutlineEl(box, r);
        this.setDimmerHoles([r]);
      };
      const onScroll = () => apply();
      const onResize = () => apply();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onResize);
      this.cleanupFns.push(() => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onResize);
      });
    }
  }

  setDimmerHoles(rects, pad = 8) {
    if (!this.dimmer) return;
    const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

    const holes = rects.map(r => {
      const x = Math.max(0, r.left - pad);
      const y = Math.max(0, r.top - pad);
      const w = Math.max(0, r.width + pad * 2);
      const h = Math.max(0, r.height + pad * 2);
      const rx = 12;
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ry="${rx}" fill="black"/>`;
    }).join("");

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${vw}" height="${vh}" viewBox="0 0 ${vw} ${vh}">
  <defs>
    <mask id="tour-mask" maskUnits="userSpaceOnUse">
      <rect width="100%" height="100%" fill="white"/>
      ${holes}
    </mask>
  </defs>
  <rect width="100%" height="100%" fill="white" mask="url(#tour-mask)"/>
</svg>`.trim();

    const url = `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}')`;
    this.dimmer.style.webkitMaskImage = url;
    this.dimmer.style.maskImage = url;
    this.dimmer.style.webkitMaskRepeat = "no-repeat";
    this.dimmer.style.maskRepeat = "no-repeat";
    this.dimmer.style.webkitMaskSize = "100% 100%";
    this.dimmer.style.maskSize = "100% 100%";
  }

  getRects(els) {
    return els.map(el => el.getBoundingClientRect());
  }

  clearStep() {
    this.pop?.classList.remove("is-open");
    this.cleanupFns.splice(0).forEach(fn => { try { fn(); } catch {} });
    if (this.outlineLayer) this.outlineLayer.innerHTML = "";
    this.outlines = [];
    if (this.dimmer) {
      this.dimmer.style.webkitMaskImage = "";
      this.dimmer.style.maskImage = "";
    }
  }

  isVisible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  onKey(e) {
    if (!this.active) return;
    if (e.key === "Escape") this.end();
    if (e.key === "Enter" || e.key === "ArrowRight") this.nextStep();
    if (e.key === "ArrowLeft") this.prevStep();
  }

  setGateEnabled(enabled) {
    const nextBtn = this.pop?.querySelector('button[data-act="next"]');
    if (nextBtn) {
      nextBtn.disabled = !enabled;
      nextBtn.style.opacity = enabled ? "1" : ".6";
      nextBtn.style.cursor = enabled ? "pointer" : "not-allowed";
    }
  }
}

// Export & global
const TourInstance = new Tour();
export { TourInstance };
window.Tour = TourInstance;

// 自動起動は無効化（ページを開いたときにチュートリアルのポップアップを出さない）
// window.addEventListener("DOMContentLoaded", () => {
//   setTimeout(() => window.Tour.start("intro"), 300);
// });
