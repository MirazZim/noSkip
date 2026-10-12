import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { animate, motion, motionValue, useReducedMotion } from "motion/react";
import type { MotionValue, ValueAnimationTransition } from "motion/react";

// A draggable, springy stack of cards. Drag or flick the top card past the
// threshold to send it to the back; the rest lift forward.
//
// Adapted from a "Stack" gallery component for interactive content:
//  • cards are keyed — order is tracked by key, so removing any card (e.g. a
//    payment that was just confirmed) never mixes up the others' motion
//  • drags only start on the card surface; buttons, inputs and pickers inside
//    a card behave normally
//  • cards under the top one are inert (no clicks, no focus)
//  • flingTop() throws the top card out of the stack before the caller
//    removes it — used for Confirm / Dismiss

type Layout = "fan" | "cascade" | "deck" | "pile";
type Vector = [number, number];
type Sample = [number, number, number];
type SpringKind = "place" | "settle" | "tuck" | "face" | "lean" | "press" | "fling";

export interface StackItem {
  key: string;
  node: ReactNode;
}

export interface CardStackHandle {
  /** Animate the top card out along `direction`; resolves when it's gone. */
  flingTop: (direction: Vector) => Promise<void>;
}

export interface CardStackProps {
  items: StackItem[];
  layout?: Layout;
  visible?: number;
  spread?: number;
  depth?: number;
  radius?: number;
  /** true = default drop shadow, or pass any CSS box-shadow */
  shadow?: boolean | string;
  tilt?: number;
  threshold?: number;
  speed?: number;
  onTopChange?: (key: string | undefined) => void;
  className?: string;
  style?: CSSProperties;
}

interface Placement { x: number; y: number; rotate: number; scale: number }

interface CardValues {
  x: MotionValue<number>;
  y: MotionValue<number>;
  rotate: MotionValue<number>;
  scale: MotionValue<number>;
  tiltX: MotionValue<number>;
  tiltY: MotionValue<number>;
  spin: MotionValue<number>;
  lift: MotionValue<number>;
  grabX: MotionValue<number>;
  grabY: MotionValue<number>;
  z: MotionValue<number>;
  opacity: MotionValue<number>;
  shade: MotionValue<number>;
}

interface Settings {
  layout: Layout;
  visible: number;
  spread: number;
  depth: number;
  tilt: number;
  threshold: number;
  speed: number;
  count: number;
  reduceMotion: boolean;
}

interface DragState {
  key: string;
  id: number;
  element: HTMLDivElement;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  homeX: number;
  homeY: number;
  vx: number;
  vy: number;
  idle: ReturnType<typeof setTimeout> | 0;
  moved: boolean;
  progress: number;
  samples: Sample[];
}

const ORIGINS: Record<Layout, Vector> = { fan: [0.9, 0.9], cascade: [0.5, 0.5], deck: [0.5, 0], pile: [0.5, 0.5] };
const EXITS: Partial<Record<Layout, Vector>> = { fan: [1, -0.3], cascade: [0.8, 0.6], deck: [0, 1] };
const SHADOW = "0 18px 40px -14px rgba(0, 0, 0, 0.45), 0 4px 10px -4px rgba(0, 0, 0, 0.2)";
const CLICK_SLOP = 6;
const FLICK_SPEED = 650;
const LEAN_SPEED = 1300;
const LEAN_REACH = 260;
const PRESS_SCALE = 1.02;
const INTERACTIVE =
  'button, a, input, textarea, select, label, summary, [role="button"], [role="combobox"], [role="switch"], [role="option"], [data-no-drag]';
const SPRINGS: Record<SpringKind, Vector> = {
  place: [260, 24],
  settle: [260, 30],
  tuck: [240, 28],
  face: [240, 30],
  lean: [200, 26],
  press: [420, 34],
  fling: [420, 36],
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

const noise = (seed: number) => {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};

const seedOf = (key: string) => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 9973;
  return h;
};

const placement = (layout: Layout, position: number, seed: number, spread: number, depth: number): Placement => {
  if (layout === "cascade") {
    return { x: -position * spread * 28, y: -position * spread * 28, rotate: 0, scale: 1 - position * depth * 0.07 };
  }
  if (layout === "deck") {
    return { x: 0, y: -position * spread * 32, rotate: 0, scale: 1 - position * depth * 0.1 };
  }
  if (layout === "pile") {
    return {
      x: (noise(seed + 1) - 0.5) * spread * 56,
      y: (noise(seed + 2) - 0.5) * spread * 44,
      rotate: (noise(seed + 3) - 0.5) * spread * 40,
      scale: 1 - position * depth * 0.03,
    };
  }
  return { x: 0, y: 0, rotate: position * spread * 8, scale: 1 - position * depth * 0.12 };
};

const releaseVelocity = (samples: Sample[], time: number): Vector => {
  const recent = samples.filter((sample) => time - sample[2] <= 100);
  if (recent.length < 2) return [0, 0];
  const first = recent[0];
  const last = recent[recent.length - 1];
  const elapsed = Math.max((last[2] - first[2]) / 1000, 0.008);
  return [(last[0] - first[0]) / elapsed, (last[1] - first[1]) / elapsed];
};

const sameOrder = (a: string[], b: string[]) => a.length === b.length && a.every((k, i) => k === b[i]);

export const CardStack = forwardRef<CardStackHandle, CardStackProps>(function CardStack(
  {
    items,
    layout = "fan",
    visible = 4,
    spread = 0.5,
    depth = 0.5,
    radius = 24,
    shadow = true,
    tilt = 12,
    threshold = 90,
    speed = 1,
    onTopChange,
    className = "",
    style,
  },
  ref,
) {
  const count = items.length;
  const shape: Layout = layout in ORIGINS ? layout : "fan";
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const [order, setOrder] = useState<string[]>(() => items.map((i) => i.key));
  const [dragging, setDragging] = useState(false);
  const orderRef = useRef(order);
  const valuesRef = useRef(new Map<string, CardValues>());
  const elementsRef = useRef(new Map<string, HTMLDivElement>());
  const flyingRef = useRef(new Map<string, { turned: boolean }>());
  const dragRef = useRef<DragState | null>(null);
  const aliveRef = useRef(true);
  const mountedRef = useRef(false);
  const settingsRef = useRef<Settings | null>(null);
  const frameRef = useRef(0);
  const liftedRef = useRef(0);
  const onTopChangeRef = useRef(onTopChange);
  onTopChangeRef.current = onTopChange;

  // Keep order in sync with items: survivors keep their place, new cards join at the back
  const keys = items.map((i) => i.key);
  const synced = [...order.filter((k) => keys.includes(k)), ...keys.filter((k) => !order.includes(k))];
  if (!sameOrder(synced, order)) {
    orderRef.current = synced;
    setOrder(synced);
  }

  settingsRef.current = {
    layout: shape,
    visible: clamp(Math.round(visible), 1, Math.max(count, 1)),
    spread: clamp(spread, 0, 2),
    depth: clamp(depth, 0, 1),
    tilt: clamp(tilt, 0, 89),
    threshold: Math.max(threshold, 0),
    speed: clamp(speed, 0.2, 4),
    count,
    reduceMotion: !!reduceMotion,
  };

  const valuesFor = (key: string): CardValues => {
    let values = valuesRef.current.get(key);
    if (!values) {
      const s = settingsRef.current!;
      const position = Math.max(0, orderRef.current.indexOf(key));
      // New cards start where the back of the stack is, so they slide in rather than pop
      const start = placement(s.layout, Math.min(position, s.visible - 1), seedOf(key), s.spread, s.depth);
      values = {
        x: motionValue(start.x),
        y: motionValue(start.y),
        rotate: motionValue(start.rotate),
        scale: motionValue(start.scale),
        tiltX: motionValue(0),
        tiltY: motionValue(0),
        spin: motionValue(0),
        lift: motionValue(1),
        grabX: motionValue(0.5),
        grabY: motionValue(0.5),
        z: motionValue(s.count - position),
        // Start visible, not faded in: while a card (an ancestor of its glass
        // face) has opacity < 1, its backdrop-filter can't see what's behind,
        // and Chrome may not re-blur once the fade ends — the card shows up
        // un-frosted until something forces a repaint.
        opacity: motionValue(position < s.visible ? 1 : 0),
        shade: motionValue(0),
      };
      valuesRef.current.set(key, values);
    }
    return values;
  };

  const springFor = (s: Settings, kind: SpringKind, extra: ValueAnimationTransition<number> = {}): ValueAnimationTransition<number> => {
    if (s.reduceMotion) return { duration: 0.2, ease: "easeOut", delay: extra.delay || 0 };
    const [stiffness, damping] = SPRINGS[kind];
    return {
      type: "spring",
      stiffness: stiffness * s.speed * s.speed,
      damping: damping * s.speed,
      restDelta: 0.01,
      restSpeed: 0.5,
      ...extra,
    };
  };

  const settleFace = (values: CardValues, s: Settings, delay = 0) => {
    const transition = springFor(s, "face", { delay });
    animate(values.tiltX, 0, transition);
    animate(values.tiltY, 0, transition);
    animate(values.spin, 0, transition);
    animate(values.lift, 1, transition);
  };

  const placeCard = (
    key: string,
    position: number,
    { delay = 0, lift = 0, kind = "place" as SpringKind, velocity = null as Vector | null, keepZ = false } = {},
  ) => {
    const s = settingsRef.current!;
    const values = valuesFor(key);
    const shown = Math.min(position, s.visible - 1);
    const seed = seedOf(key);
    const target = placement(s.layout, shown, seed, s.spread, s.depth);
    if (lift > 0 && shown > 0) {
      const ahead = placement(s.layout, shown - 1, seed, s.spread, s.depth);
      target.x = mix(target.x, ahead.x, lift);
      target.y = mix(target.y, ahead.y, lift);
      target.rotate = mix(target.rotate, ahead.rotate, lift);
      target.scale = mix(target.scale, ahead.scale, lift);
    }
    const motionSpring = springFor(s, kind, { delay });
    const fade: ValueAnimationTransition<number> = { duration: s.reduceMotion ? 0.2 : 0.35 / s.speed, ease: "easeOut", delay };
    if (!keepZ) values.z.set(s.count - position);
    animate(values.x, target.x, velocity ? { ...motionSpring, velocity: velocity[0] } : motionSpring);
    animate(values.y, target.y, velocity ? { ...motionSpring, velocity: velocity[1] } : motionSpring);
    animate(values.rotate, target.rotate, motionSpring);
    animate(values.scale, target.scale, motionSpring);
    settleFace(values, s, delay);
    animate(values.opacity, position < s.visible ? 1 : 0, fade);
    animate(values.shade, Math.min(0.5, shown * s.depth * 0.12 * (1 - lift)), fade);
  };

  const placeAll = ({ stagger = 0, lift = 0, released = "", velocity = null as Vector | null, kind = "place" as SpringKind, skip = "" } = {}) => {
    const drag = dragRef.current;
    let position = 0;
    orderRef.current.forEach((key) => {
      if (key === skip) return;
      const at = position++;
      const flight = flyingRef.current.get(key);
      if (flight && !flight.turned) return;
      if (drag && drag.moved && drag.key === key) return;
      const isReleased = key === released;
      placeCard(key, at, {
        delay: at * stagger,
        lift: at > 0 ? lift : 0,
        kind: flight ? "tuck" : isReleased ? "settle" : kind,
        velocity: isReleased ? velocity : null,
        keepZ: !!flight,
      });
    });
  };

  const commit = (next: string[]) => {
    orderRef.current = next;
    setOrder(next);
  };

  const sendToBack = (direction: Vector | null, velocity: Vector | null = null) => {
    const s = settingsRef.current!;
    const current = orderRef.current;
    if (current.length < 2) return;
    const top = current[0];
    if (flyingRef.current.has(top)) return;
    const next = [...current.slice(1), top];
    if (s.reduceMotion) {
      commit(next);
      return;
    }
    const seed = seedOf(top);
    let [dx, dy] = direction || EXITS[s.layout] || [Math.cos(noise(seed + 9) * 6.283), Math.sin(noise(seed + 9) * 6.283)];
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    const bounds = rootRef.current?.getBoundingClientRect();
    const width = bounds?.width || 240;
    const height = bounds?.height || 240;
    const clearance = Math.min(width / Math.max(Math.abs(dx), 0.01), height / Math.max(Math.abs(dy), 0.01));
    const home = placement(s.layout, 0, seed, s.spread, s.depth);
    const travel = clearance * 1.12 + 40;
    const out = [home.x + dx * travel, home.y + dy * travel];
    const values = valuesFor(top);
    const launch = springFor(s, "fling");
    const flight = { turned: false };
    flyingRef.current.set(top, flight);
    values.z.set(s.count + 1);
    animate(values.x, out[0], velocity ? { ...launch, velocity: velocity[0] } : launch);
    animate(values.y, out[1], velocity ? { ...launch, velocity: velocity[1] } : launch);
    settleFace(values, s);
    commit(next);
    const span = Math.max(Math.hypot(out[0] - values.x.get(), out[1] - values.y.get()), 1);
    let landed = false;
    const turn = () => {
      flight.turned = true;
      const position = orderRef.current.indexOf(top);
      if (position >= 0) placeCard(top, position, { kind: "tuck", keepZ: !landed });
    };
    const land = () => {
      landed = true;
      if (flyingRef.current.get(top) === flight) flyingRef.current.delete(top);
      const position = orderRef.current.indexOf(top);
      if (position >= 0) values.z.set(settingsRef.current!.count - position);
    };
    const fallback = setTimeout(() => {
      if (!flight.turned) turn();
      if (!landed) land();
    }, 1500 / s.speed);
    const clearOfPile = () => {
      const element = elementsRef.current.get(top);
      if (!element) return true;
      const mine = element.getBoundingClientRect();
      for (const [key, other] of elementsRef.current) {
        if (key === top || flyingRef.current.has(key) || valuesFor(key).opacity.get() < 0.5) continue;
        const box = other.getBoundingClientRect();
        if (mine.left < box.right && mine.right > box.left && mine.top < box.bottom && mine.bottom > box.top) return false;
      }
      return true;
    };
    const watch = () => {
      if (!aliveRef.current || (flight.turned && landed)) {
        clearTimeout(fallback);
        return;
      }
      const x = values.x.get();
      const y = values.y.get();
      const outward = values.x.getVelocity() * dx + values.y.getVelocity() * dy;
      if (!flight.turned && (Math.hypot(out[0] - x, out[1] - y) <= span * 0.06 || outward < 0)) turn();
      if (!landed && (clearOfPile() || (flight.turned && outward < 0))) land();
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  };

  // Throw the top card away for good — the caller removes it from `items` after
  const flingTop = (direction: Vector) =>
    new Promise<void>((resolve) => {
      const s = settingsRef.current!;
      const top = orderRef.current[0];
      if (top === undefined) return resolve();
      const values = valuesFor(top);
      flyingRef.current.set(top, { turned: false });
      values.z.set(s.count + 1);
      // Everything behind moves up right away
      placeAll({ skip: top });
      if (s.reduceMotion) {
        animate(values.opacity, 0, { duration: 0.15 });
        setTimeout(resolve, 150);
        return;
      }
      const [dx, dy] = direction;
      const length = Math.hypot(dx, dy) || 1;
      const width = rootRef.current?.getBoundingClientRect().width || 320;
      const travel = width * 1.1;
      const launch = springFor(s, "fling");
      animate(values.x, values.x.get() + (dx / length) * travel, launch);
      animate(values.y, values.y.get() + (dy / length) * travel, launch);
      animate(values.rotate, values.rotate.get() + (dx / length) * 18, launch);
      animate(values.opacity, 0, { duration: 0.28, ease: "easeIn" });
      setTimeout(resolve, 280);
    });

  useImperativeHandle(ref, () => ({ flingTop }));

  const lean = (drag: DragState) => {
    const s = settingsRef.current!;
    if (s.reduceMotion) return;
    const values = valuesFor(drag.key);
    const offsetX = values.x.get() - drag.homeX;
    const offsetY = values.y.get() - drag.homeY;
    const sideways = clamp(drag.vx / LEAN_SPEED, -1, 1) * 0.7 + clamp(offsetX / LEAN_REACH, -1, 1) * 0.3;
    const upward = clamp(-drag.vy / LEAN_SPEED, -1, 1) * 0.7 + clamp(-offsetY / LEAN_REACH, -1, 1) * 0.3;
    const follow = springFor(s, "lean");
    animate(values.tiltY, sideways * s.tilt, follow);
    animate(values.tiltX, upward * s.tilt, follow);
    animate(values.spin, clamp(offsetX / LEAN_REACH, -1, 1) * 6, follow);
  };

  const onMove = (event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.id) return;
    const s = settingsRef.current!;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const values = valuesFor(drag.key);
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < CLICK_SLOP) return;
      drag.moved = true;
      values.x.stop();
      values.y.stop();
      drag.originX = values.x.get() - dx;
      drag.originY = values.y.get() - dy;
      try { drag.element.setPointerCapture(drag.id); } catch { /* element gone */ }
      setDragging(true);
    }
    values.x.set(drag.originX + dx);
    values.y.set(drag.originY + dy);
    drag.samples.push([event.clientX, event.clientY, event.timeStamp]);
    if (drag.samples.length > 12) drag.samples.shift();
    [drag.vx, drag.vy] = releaseVelocity(drag.samples, event.timeStamp);
    drag.progress = clamp(Math.hypot(dx, dy) / Math.max(s.threshold, 1), 0, 1);
    // Pointer events can fire at 120Hz+; restarting springs on each one is
    // what makes a drag feel jittery. Fold them into one update per frame.
    if (!frameRef.current) {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0;
        const live = dragRef.current;
        if (!live || live !== drag) return;
        lean(live);
        if (Math.abs(live.progress - liftedRef.current) > 0.03) {
          liftedRef.current = live.progress;
          placeAll({ lift: live.progress * 0.4, kind: "settle" });
        }
      });
    }
    clearTimeout(drag.idle);
    drag.idle = setTimeout(() => {
      if (dragRef.current !== drag) return;
      drag.vx = 0;
      drag.vy = 0;
      lean(drag);
    }, 70);
  };

  const onUp = (event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.id) return;
    dragRef.current = null;
    clearTimeout(drag.idle);
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    window.removeEventListener("pointermove", listeners.current.move);
    window.removeEventListener("pointerup", listeners.current.up);
    window.removeEventListener("pointercancel", listeners.current.up);
    try { drag.element.releasePointerCapture(drag.id); } catch { /* element gone */ }
    const s = settingsRef.current!;
    if (!drag.moved) {
      settleFace(valuesFor(drag.key), s);
      return;
    }
    setDragging(false);
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const [vx, vy] = releaseVelocity(drag.samples, event.timeStamp);
    const distance = Math.hypot(dx, dy);
    const pace = Math.hypot(vx, vy);
    const flick = pace > FLICK_SPEED && distance > 16 && vx * dx + vy * dy > 0;
    if (event.type === "pointerup" && s.count > 1 && (distance > s.threshold || flick)) {
      sendToBack(pace > 300 ? [vx, vy] : [dx, dy], [vx, vy]);
    } else {
      placeAll({ released: drag.key, velocity: [clamp(vx, -3000, 3000), clamp(vy, -3000, 3000)] });
    }
  };

  // Stable listeners that always call the latest handlers
  const actions = useRef({ onMove, onUp });
  actions.current = { onMove, onUp };
  const listeners = useRef({
    move: (event: PointerEvent) => actions.current.onMove(event),
    up: (event: PointerEvent) => actions.current.onUp(event),
  });

  const onDown = (event: ReactPointerEvent<HTMLDivElement>, key: string) => {
    if (event.button !== 0 || dragRef.current) return;
    if (orderRef.current[0] !== key || flyingRef.current.has(key)) return;
    // Let buttons, inputs and pickers inside the card do their own thing
    if ((event.target as HTMLElement).closest(INTERACTIVE)) return;
    const s = settingsRef.current!;
    const values = valuesFor(key);
    const home = placement(s.layout, 0, seedOf(key), s.spread, s.depth);
    const bounds = event.currentTarget.getBoundingClientRect();
    values.grabX.set(clamp((event.clientX - bounds.left) / Math.max(bounds.width, 1), 0, 1));
    values.grabY.set(clamp((event.clientY - bounds.top) / Math.max(bounds.height, 1), 0, 1));
    if (!s.reduceMotion) animate(values.lift, PRESS_SCALE, springFor(s, "press"));
    liftedRef.current = 0;
    dragRef.current = {
      key,
      id: event.pointerId,
      element: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      originX: 0,
      originY: 0,
      homeX: home.x,
      homeY: home.y,
      vx: 0,
      vy: 0,
      idle: 0,
      moved: false,
      progress: 0,
      samples: [[event.clientX, event.clientY, event.timeStamp]],
    };
    if (event.pointerType === "mouse") event.preventDefault();
    window.addEventListener("pointermove", listeners.current.move);
    window.addEventListener("pointerup", listeners.current.up);
    window.addEventListener("pointercancel", listeners.current.up);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      sendToBack(null);
    }
  };

  useLayoutEffect(() => {
    orderRef.current = order;
    // Forget cards that left the stack
    for (const key of valuesRef.current.keys()) {
      if (!order.includes(key)) {
        Object.values(valuesRef.current.get(key)!).forEach((v) => v.stop());
        valuesRef.current.delete(key);
        flyingRef.current.delete(key);
      }
    }
    placeAll({ stagger: mountedRef.current ? 0 : 0.06 });
    mountedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, shape, visible, spread, depth, speed, count]);

  const top = order[0];
  useEffect(() => {
    onTopChangeRef.current?.(top);
  }, [top]);

  useEffect(() => {
    aliveRef.current = true;
    const values = valuesRef.current;
    const l = listeners.current;
    return () => {
      aliveRef.current = false;
      cancelAnimationFrame(frameRef.current);
      if (dragRef.current) clearTimeout(dragRef.current.idle);
      window.removeEventListener("pointermove", l.move);
      window.removeEventListener("pointerup", l.up);
      window.removeEventListener("pointercancel", l.up);
      values.forEach((group) => Object.values(group).forEach((value) => value.stop()));
    };
  }, []);

  const [originX, originY] = ORIGINS[shape];
  const byKey = new Map(items.map((i) => [i.key, i.node]));

  return (
    <div
      ref={rootRef}
      className={`group relative h-full w-full outline-none ${className}`.trim()}
      style={style}
      tabIndex={0}
      role="group"
      aria-label="Card stack"
      data-dragging={dragging ? "" : undefined}
      onKeyDown={onKeyDown}
    >
      {keys.map((key) => {
        const values = valuesFor(key);
        const isTop = order[0] === key;
        return (
          <motion.div
            key={key}
            ref={(element: HTMLDivElement | null) => {
              if (element) elementsRef.current.set(key, element);
              else elementsRef.current.delete(key);
            }}
            className="absolute inset-0 will-change-transform [-webkit-tap-highlight-color:transparent]"
            aria-hidden={isTop ? undefined : true}
            data-top={isTop ? "" : undefined}
            // Cards underneath can't be clicked or focused
            {...(isTop ? {} : { inert: "" })}
            style={{
              x: values.x,
              y: values.y,
              rotate: values.rotate,
              scale: values.scale,
              zIndex: values.z,
              opacity: values.opacity,
              originX,
              originY,
              cursor: isTop && count > 1 ? (dragging ? "grabbing" : "grab") : "default",
              touchAction: isTop ? "pan-y" : "auto",
            }}
            onPointerDown={(event) => onDown(event, key)}
          >
            <motion.div
              className="absolute inset-0 overflow-hidden will-change-transform"
              style={{
                rotateX: values.tiltX,
                rotateY: values.tiltY,
                rotate: values.spin,
                scale: values.lift,
                originX: values.grabX,
                originY: values.grabY,
                transformPerspective: 900,
                borderRadius: radius,
                boxShadow: shadow === true ? SHADOW : shadow || "none",
              }}
            >
              <div className="relative h-full w-full overflow-hidden" style={{ borderRadius: radius }}>
                {byKey.get(key)}
              </div>
              <motion.div
                className="pointer-events-none absolute inset-0 bg-black"
                style={{ opacity: values.shade, borderRadius: radius }}
              />
            </motion.div>
          </motion.div>
        );
      })}
    </div>
  );
});
