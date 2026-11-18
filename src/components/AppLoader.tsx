import { cn } from "@/lib/utils";

// ─── App loader ───────────────────────────────────────────────────────────────
// A honeycomb of hexagons that pulses outward from the centre, ring by ring
// (design from Uiverse.io by Nawsome). Styles live in public/loader.css — the
// same markup is shown in index.html before the app boots, so the hand-off is
// seamless. The hexagons use the current text colour.

/** [left, top] offsets (px from the centre) for each hexagon, by ring. */
const HEX_RINGS: [number, number][][] = [
  [[-15, -15]],
  [[-47, -15], [-31, -43], [1, -43], [17, -15], [-31, 13], [1, 13]],
  [[-63, -43], [33, -43], [-15, 41], [-63, 13], [33, 13], [-15, -71], [-47, -71], [17, -71], [-47, 41], [17, 41], [-79, -15], [49, -15]],
  [[-63, -99], [33, -99], [1, -99], [-31, -99], [-63, 69], [33, 69], [1, 69], [-31, 69], [-95, -43], [-95, 13],
   [49, 41], [-79, -71], [-111, -15], [65, -43], [65, 13], [-79, 41], [49, -71], [81, -15]],
];

export function AppLoader({ className }: { className?: string }) {
  return (
    <div className={cn("socket", className)} role="status" aria-label="Loading">
      {HEX_RINGS.map((ring, r) =>
        ring.map(([x, y], i) => (
          <div key={`${r}-${i}`} className={`gel r${r}`} style={{ marginLeft: x, marginTop: y }}>
            <div className="hex-brick h1" /><div className="hex-brick h2" /><div className="hex-brick h3" />
          </div>
        ))
      )}
    </div>
  );
}
