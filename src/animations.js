// Note fly-out / fly-in animations (Web Animations API).

import { motionEnabled } from "./settings.js";

// The user can turn animation off in settings; the system preference always
// wins too. Either way every helper below resolves immediately.
const reduced = () =>
  !motionEnabled() || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const RECT_CLIP =
  "polygon(0% 0%, 25% 0%, 50% 0%, 75% 0%, 100% 0%, 100% 50%, 100% 100%, 75% 100%, 50% 100%, 25% 100%, 0% 100%, 0% 50%)";
const MID_CLIP =
  "polygon(9% 8%, 31% 7%, 52% 7%, 73% 7%, 91% 8%, 92% 50%, 91% 92%, 73% 93%, 52% 93%, 31% 93%, 9% 92%, 8% 50%)";
const BLOB_CLIP =
  "polygon(26% 20%, 42% 10%, 60% 14%, 76% 22%, 86% 34%, 90% 56%, 82% 80%, 66% 90%, 46% 88%, 28% 84%, 16% 68%, 10% 42%)";

const rectOf = (el) => el.getBoundingClientRect();
const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

function tiltOf(el) {
  return getComputedStyle(el).getPropertyValue("--tilt").trim() || "0deg";
}

function tiltNum(el) {
  return parseFloat(tiltOf(el)) || 0;
}

function makeClone(el, rect) {
  const clone = el.cloneNode(true);
  clone.classList.add("flying");
  clone.classList.remove("editing", "dragging");
  clone.style.position = "fixed";
  clone.style.zIndex = ""; // let .flying's z band win over the note's own z
  clone.style.left = rect.left + "px";
  clone.style.top = rect.top + "px";
  clone.style.width = rect.width + "px";
  clone.style.height = rect.height + "px";
  clone.style.transformOrigin = "50% 50%";
  document.body.appendChild(clone);
  return clone;
}

function arcTo(fromRect, ballRect) {
  const fc = center(fromRect);
  const bc = center(ballRect);
  const dx = bc.x - fc.x;
  const dy = bc.y - fc.y;
  const dist = Math.hypot(dx, dy) || 1;
  return {
    dx,
    dy,
    nx: -dy / dist,
    ny: dx / dist,
    arc: Math.min(70, dist * 0.22),
  };
}

function dustMotes(fromRect, ballEl) {
  const start = center(fromRect);
  const end = center(rectOf(ballEl));
  for (let i = 0; i < 4; i++) {
    const m = document.createElement("div");
    m.className = "mote";
    const ox = (Math.random() - 0.5) * Math.min(fromRect.width, 90);
    const oy = (Math.random() - 0.5) * Math.min(fromRect.height, 60);
    m.style.left = start.x + ox + "px";
    m.style.top = start.y + oy + "px";
    document.body.appendChild(m);
    const dx = end.x - (start.x + ox);
    const dy = end.y - (start.y + oy);
    m.animate(
      [
        { transform: "translate(0, 0) scale(1)", opacity: 0.9 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0 },
      ],
      { duration: 380 + Math.random() * 160, delay: i * 55, easing: "ease-in", fill: "forwards" }
    ).finished
      .then(() => m.remove())
      .catch(() => m.remove());
  }
}

function swallow(ballEl) {
  ballEl.animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(1.24)", offset: 0.25 },
      { transform: "scale(0.9)", offset: 0.5 },
      { transform: "scale(1.06)", offset: 0.75 },
      { transform: "scale(1)" },
    ],
    { duration: 480, easing: "ease-out" }
  );
}

function chomp(ballEl) {
  ballEl.animate(
    [
      { transform: "scale(1, 1)" },
      { transform: "scale(1.12, 0.87)", offset: 0.3 },
      { transform: "scale(0.94, 1.08)", offset: 0.62 },
      { transform: "scale(1, 1)" },
    ],
    { duration: 470, easing: "ease-out" }
  );
}

/** Note lifts, arcs into the vacuum ball and shrinks away; ball swallows with dust motes. */
export function suckAway(noteEl, ballEl) {
  if (reduced()) return Promise.resolve();
  const from = rectOf(noteEl);
  const ball = rectOf(ballEl);
  const clone = makeClone(noteEl, from);
  noteEl.style.visibility = "hidden"; // no duplicate while the clone flies
  const { dx, dy, nx, ny, arc } = arcTo(from, ball);
  const tilt = tiltOf(noteEl);
  const anim = clone.animate(
    [
      { offset: 0, transform: `translate(0px, 0px) scale(1) rotate(${tilt})`, opacity: 1, easing: "ease-out" },
      { offset: 0.14, transform: `translate(0px, -10px) scale(1.04) rotate(${tilt})`, opacity: 1, easing: "ease-in" },
      {
        offset: 0.55,
        transform: `translate(${dx * 0.55 + nx * arc}px, ${dy * 0.55 + ny * arc}px) scale(0.45) rotate(12deg)`,
        opacity: 1,
        easing: "ease-in",
      },
      { offset: 1, transform: `translate(${dx}px, ${dy}px) scale(0.07) rotate(30deg)`, opacity: 0 },
    ],
    { duration: 640, fill: "forwards" }
  );
  const done = () => {
    clone.remove();
    noteEl.style.visibility = "";
    swallow(ballEl);
    dustMotes(from, ballEl);
  };
  const fail = () => {
    clone.remove();
    noteEl.style.visibility = "";
  };
  anim.finished.then(done).catch(fail);
  return anim.finished.catch(() => {});
}

/** Note crumples into a paper ball in place, then tumbles into the trash ball. */
export function crumpleAway(noteEl, ballEl) {
  if (reduced()) return Promise.resolve();
  const from = rectOf(noteEl);
  const ball = rectOf(ballEl);
  const clone = makeClone(noteEl, from);
  noteEl.style.visibility = "hidden"; // no duplicate while the clone flies
  const { dx, dy, nx, ny, arc } = arcTo(from, ball);
  const tilt = tiltNum(noteEl);
  const anim = clone.animate(
    [
      {
        offset: 0,
        clipPath: RECT_CLIP,
        transform: `translate(0px, 0px) scale(1) rotate(${tilt}deg)`,
        opacity: 1,
        easing: "ease-in",
      },
      {
        offset: 0.16,
        clipPath: RECT_CLIP,
        transform: `translate(0px, -4px) scale(0.97) rotate(${tilt + 3}deg)`,
        opacity: 1,
        easing: "ease-in-out",
      },
      {
        offset: 0.32,
        clipPath: MID_CLIP,
        transform: `translate(0px, 0px) scale(0.74) rotate(${tilt - 5}deg)`,
        opacity: 1,
        easing: "ease-in-out",
      },
      {
        offset: 0.46,
        clipPath: BLOB_CLIP,
        transform: "translate(0px, 0px) scale(0.55) rotate(-8deg)",
        opacity: 1,
        easing: "ease-in",
      },
      {
        offset: 0.7,
        clipPath: BLOB_CLIP,
        transform: `translate(${dx * 0.55 + nx * arc}px, ${dy * 0.55 + ny * arc}px) scale(0.3) rotate(95deg)`,
        opacity: 1,
        easing: "ease-in",
      },
      {
        offset: 1,
        clipPath: BLOB_CLIP,
        transform: `translate(${dx}px, ${dy}px) scale(0.07) rotate(205deg)`,
        opacity: 0,
      },
    ],
    { duration: 720, fill: "forwards" }
  );
  const done = () => {
    clone.remove();
    noteEl.style.visibility = "";
    chomp(ballEl);
  };
  const fail = () => {
    clone.remove();
    noteEl.style.visibility = "";
  };
  anim.finished.then(done).catch(fail);
  return anim.finished.catch(() => {});
}

/** Restored note inflates out of a ball back onto the board (optionally un-crumpling). */
export function inflateFrom(el, ballEl, { uncrumple = false } = {}) {  if (reduced()) return Promise.resolve();
  const to = rectOf(el);
  const ball = rectOf(ballEl);
  const clone = makeClone(el, to);
  el.style.visibility = "hidden";
  const { dx, dy } = arcTo(to, ball);
  const tilt = tiltOf(el);
  const frames = uncrumple
    ? [
        { offset: 0, clipPath: BLOB_CLIP, transform: `translate(${dx}px, ${dy}px) scale(0.07) rotate(205deg)`, opacity: 0, easing: "ease-out" },
        { offset: 0.2, clipPath: BLOB_CLIP, transform: `translate(${dx * 0.6}px, ${dy * 0.6}px) scale(0.3) rotate(95deg)`, opacity: 1, easing: "ease-out" },
        { offset: 0.58, clipPath: MID_CLIP, transform: `translate(${dx * 0.22}px, ${dy * 0.22}px) scale(0.72) rotate(10deg)`, opacity: 1, easing: "ease-out" },
        { offset: 0.82, clipPath: RECT_CLIP, transform: "translate(0px, 0px) scale(1.05) rotate(-2deg)", opacity: 1, easing: "ease-out" },
        { offset: 1, clipPath: RECT_CLIP, transform: `translate(0px, 0px) scale(1) rotate(${tilt})`, opacity: 1 },
      ]
    : [
        { offset: 0, transform: `translate(${dx}px, ${dy}px) scale(0.07) rotate(30deg)`, opacity: 0, easing: "ease-out" },
        { offset: 0.22, transform: `translate(${dx * 0.5}px, ${dy * 0.5}px) scale(0.4) rotate(14deg)`, opacity: 1, easing: "ease-out" },
        { offset: 0.76, transform: "translate(0px, 0px) scale(1.07) rotate(-2deg)", opacity: 1, easing: "ease-out" },
        { offset: 1, transform: `translate(0px, 0px) scale(1) rotate(${tilt})`, opacity: 1 },
      ];
  const anim = clone.animate(frames, { duration: uncrumple ? 660 : 540, fill: "forwards" });
  const finish = () => {
    el.style.visibility = "";
    clone.remove();
    ballEl.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(1.15)", offset: 0.4 },
        { transform: "scale(1)" },
      ],
      { duration: 340, easing: "ease-out" }
    );
  };
  anim.finished.then(finish).catch(finish);
  return anim.finished;
}

/** A fresh note zooms out of the + button and lands slightly askew on the board. */
export function zoomFromButton(btnEl, noteEl) {
  if (reduced() || !btnEl || !noteEl) return;
  const b = btnEl.getBoundingClientRect();
  const n = noteEl.getBoundingClientRect();
  if (!b.width || !n.width || !n.height) return;
  const dx = b.left + b.width / 2 - (n.left + n.width / 2);
  const dy = b.top + b.height / 2 - (n.top + n.height / 2);
  if (Math.hypot(dx, dy) < 2) return; // the note essentially is the button (mobile)
  const tilt = tiltOf(noteEl);
  noteEl.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(0.06) rotate(${tilt})`, opacity: 0.5 },
      { transform: `translate(0px, 0px) scale(1) rotate(${tilt})`, opacity: 1 },
    ],
    { duration: 460, easing: "cubic-bezier(0.22, 0.9, 0.3, 1.14)" }
  );
}

/**
 * The "thanos snap": the card blurs and fades out while a puff of dust
 * particles lifts off it and disperses. Resolves when the card is gone
 * (immediately when motion is off). `delay` staggers a batch of cards.
 */
export function dustAway(el, delay = 0) {
  if (!el) return Promise.resolve();
  if (reduced()) {
    el.remove();
    return Promise.resolve();
  }

  const r = el.getBoundingClientRect();
  const puffs = 16;
  for (let i = 0; i < puffs; i++) {
    const p = document.createElement("div");
    p.className = "dust";
    const size = 2.5 + Math.random() * 5;
    p.style.width = size + "px";
    p.style.height = size + "px";
    p.style.left = r.left + Math.random() * r.width + "px";
    p.style.top = r.top + Math.random() * r.height + "px";
    document.body.appendChild(p);
    const dx = (Math.random() - 0.5) * 70;
    const dy = -(16 + Math.random() * 74);
    p.animate(
      [
        { transform: "translate(0px, 0px) scale(1)", opacity: 0 },
        { transform: `translate(${dx * 0.35}px, ${dy * 0.35}px) scale(1)`, opacity: 0.85, offset: 0.22 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.25)`, opacity: 0 },
      ],
      {
        duration: 460 + Math.random() * 440,
        delay: delay + 80 + Math.random() * 220,
        easing: "cubic-bezier(0.2, 0.7, 0.4, 1)",
        fill: "backwards", // hold the first keyframe during the delay
      }
    ).finished
      .then(() => p.remove())
      .catch(() => p.remove());
  }

  const card = el.animate(
    [
      { opacity: 1, filter: "blur(0px)", transform: "scale(1)", offset: 0 },
      { opacity: 1, filter: "blur(0px)", transform: "scale(1)", offset: 0.14 }, // hold a beat
      { opacity: 0, filter: "blur(7px)", transform: "scale(0.9)" },
    ],
    {
      duration: 560,
      delay,
      easing: "cubic-bezier(0.5, 0, 0.85, 0.5)",
      fill: "forwards",
    }
  );
  return card.finished
    .catch(() => {})
    .then(() => {
      el.remove();
    });
}
