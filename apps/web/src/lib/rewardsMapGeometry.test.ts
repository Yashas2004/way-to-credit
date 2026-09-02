import { describe, expect, it } from "vitest";
import { computeMarkerPosition, computeWaypoints, wrapText } from "./rewardsMapGeometry";

describe("computeWaypoints", () => {
  it("returns 7 points (origin + 6 milestones) spanning the full primary axis", () => {
    const points = computeWaypoints("horizontal");
    expect(points).toHaveLength(7);
    expect(points[0]?.x).toBe(90); // margin
    expect(points[6]?.x).toBe(960 - 90);
  });

  it("spans the vertical axis top-to-bottom in the vertical orientation", () => {
    const points = computeWaypoints("vertical");
    expect(points[0]?.y).toBe(90);
    expect(points[6]?.y).toBe(1040 - 90);
  });
});

describe("computeMarkerPosition", () => {
  const thresholds = [5, 10, 15, 20, 25, 30];

  it("sits at the origin when no milestone has been reached", () => {
    const waypoints = computeWaypoints("horizontal");
    const marker = computeMarkerPosition(waypoints, { thresholds, creditPoints: 0 }, "horizontal");
    expect(marker).toEqual(waypoints[0]);
  });

  it("sits exactly at a waypoint when credits exactly match its threshold", () => {
    const waypoints = computeWaypoints("horizontal");
    const marker = computeMarkerPosition(waypoints, { thresholds, creditPoints: 15 }, "horizontal");
    expect(marker.x).toBeCloseTo(waypoints[3]?.x ?? NaN, 5);
    expect(marker.y).toBeCloseTo(waypoints[3]?.y ?? NaN, 5);
  });

  it("sits partway along the curve between the last-reached and next milestone", () => {
    const waypoints = computeWaypoints("horizontal");
    // 17 is 40% of the way from 15 (level 3) to 20 (level 4).
    const marker = computeMarkerPosition(waypoints, { thresholds, creditPoints: 17 }, "horizontal");
    const p3 = waypoints[3];
    const p4 = waypoints[4];
    expect(p3).toBeDefined();
    expect(p4).toBeDefined();
    // Strictly between the two anchor points on the x axis (monotonic here).
    expect(marker.x).toBeGreaterThan(p3?.x ?? NaN);
    expect(marker.x).toBeLessThan(p4?.x ?? NaN);
  });

  it("sits at the final seal once every milestone is reached", () => {
    const waypoints = computeWaypoints("horizontal");
    const marker = computeMarkerPosition(
      waypoints,
      { thresholds, creditPoints: 500 },
      "horizontal",
    );
    expect(marker).toEqual(waypoints[6]);
  });
});

describe("wrapText", () => {
  it("returns a single line when the text already fits", () => {
    expect(wrapText("₹5,000 bonus", 16, 3)).toEqual(["₹5,000 bonus"]);
  });

  it("wraps onto multiple lines at word boundaries without exceeding maxLines", () => {
    const lines = wrapText("Half-day off, your choice of date", 13, 3);
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines.join(" ")).toContain("Half-day off,");
  });

  it("truncates with an ellipsis rather than silently dropping words past maxLines", () => {
    const lines = wrapText("one two three four five six seven eight nine ten", 5, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]?.endsWith("…")).toBe(true);
  });
});
