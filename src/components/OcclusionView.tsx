import type { OcclusionData } from "../db/types";

/**
 * Displays an image-occlusion card.
 * hideAll: every mask covers the image, the active one is highlighted (guess one).
 * hideOne: only the active mask is covered (guess one).
 */
export function OcclusionView({ data, activeMaskId, revealed }: { data: OcclusionData; activeMaskId?: string; revealed: boolean }) {
  return (
    <div className="occl" style={{ aspectRatio: `${data.width} / ${data.height}` }}>
      <img src={data.image} alt="" draggable={false} />
      {data.masks.map((m) => {
        const active = m.id === activeMaskId;
        const hidden = active ? !revealed : data.mode === "hideAll";
        if (!hidden && !active) return null;
        return (
          <div
            key={m.id}
            className={`occl__mask${active ? " occl__mask--active" : ""}${hidden ? "" : " occl__mask--revealed"}`}
            style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` }}
          >
            {active && hidden && <span>?</span>}
          </div>
        );
      })}
    </div>
  );
}
