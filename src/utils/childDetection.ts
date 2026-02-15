/**
 * Child detection gate – geometry-based, no ML.
 * Uses normalized MediaPipe landmark ratios to avoid misclassifying children as adults.
 */

export type Landmark = { x: number; y: number; z: number };

// MediaPipe Face Mesh indices (resolution-independent normalized coords)
const LANDMARKS = {
  forehead: 10,
  chin: 152,
  jawLeft: 172,
  jawRight: 397,
  eyeLeft: 33,
  eyeRight: 263,
  faceLeft: 234,
  faceRight: 454,
  foreheadRing: [10, 338, 297, 332, 284, 251] as const,
} as const;

// Child score weights and thresholds (tuned for adult vs child geometry)
export const CHILD_GATE = {
  EYE_RATIO_THRESHOLD: 0.28,
  EYE_RATIO_WEIGHT: 0.3,
  CHIN_RATIO_THRESHOLD: 0.18,
  CHIN_RATIO_WEIGHT: 0.3,
  JAW_ANGLE_THRESHOLD_DEG: 140,
  JAW_ANGLE_WEIGHT: 0.2,
  WRINKLE_SCORE_THRESHOLD: 0.05,
  WRINKLE_SCORE_WEIGHT: 0.2,
  CHILD_THRESHOLD: 0.6,
} as const;

export const CHILD_AGE = {
  MIN: 3,
  MAX: 9,
  BASE: 4,
  HEIGHT_FACTOR: 6,
} as const;

export interface ChildGeometryRatios {
  eye_ratio: number;
  chin_ratio: number;
  jaw_angle: number;
  wrinkle_score: number;
  face_height_ratio: number;
}

function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

function angleBetweenPoints(
  apex: Landmark,
  p1: Landmark,
  p2: Landmark
): number {
  const ax = p1.x - apex.x;
  const ay = p1.y - apex.y;
  const bx = p2.x - apex.x;
  const by = p2.y - apex.y;
  const dot = ax * bx + ay * by;
  const magA = Math.hypot(ax, ay);
  const magB = Math.hypot(bx, by);
  if (magA === 0 || magB === 0) return 180;
  const cos = Math.max(-1, Math.min(1, dot / (magA * magB)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Extract normalized geometry ratios from MediaPipe landmarks.
 * All values are resolution-independent (normalized 0–1 or ratios).
 */
export function extractChildGeometryRatios(
  landmarks: Landmark[]
): ChildGeometryRatios {
  const faceWidth = Math.abs(
    landmarks[LANDMARKS.faceLeft].x - landmarks[LANDMARKS.faceRight].x
  );
  const faceHeight = Math.abs(
    landmarks[LANDMARKS.forehead].y - landmarks[LANDMARKS.chin].y
  );

  const eyeWidth = Math.abs(
    landmarks[LANDMARKS.eyeLeft].x - landmarks[LANDMARKS.eyeRight].x
  );
  const eye_ratio = safeDiv(eyeWidth, faceWidth);

  const chinY = landmarks[LANDMARKS.chin].y;
  const jawMidY =
    (landmarks[LANDMARKS.jawLeft].y + landmarks[LANDMARKS.jawRight].y) / 2;
  const chinHeight = Math.abs(chinY - jawMidY);
  const chin_ratio = safeDiv(chinHeight, faceHeight);

  const jaw_angle = angleBetweenPoints(
    landmarks[LANDMARKS.chin],
    landmarks[LANDMARKS.jawLeft],
    landmarks[LANDMARKS.jawRight]
  );

  const foreheadYs = LANDMARKS.foreheadRing.map((i) => landmarks[i].y);
  const minFy = Math.min(...foreheadYs);
  const maxFy = Math.max(...foreheadYs);
  const wrinkle_score =
    faceHeight > 0 ? Math.min(1, (maxFy - minFy) / faceHeight) : 0;

  const face_height_ratio = safeDiv(faceHeight, faceWidth);

  return {
    eye_ratio,
    chin_ratio,
    jaw_angle,
    wrinkle_score,
    face_height_ratio,
  };
}

/**
 * Compute child_score in [0, 1] from geometry ratios.
 */
export function calculateChildScore(ratios: ChildGeometryRatios): number {
  let child_score = 0;

  if (ratios.eye_ratio > CHILD_GATE.EYE_RATIO_THRESHOLD)
    child_score += CHILD_GATE.EYE_RATIO_WEIGHT;
  if (ratios.chin_ratio < CHILD_GATE.CHIN_RATIO_THRESHOLD)
    child_score += CHILD_GATE.CHIN_RATIO_WEIGHT;
  if (ratios.jaw_angle < CHILD_GATE.JAW_ANGLE_THRESHOLD_DEG)
    child_score += CHILD_GATE.JAW_ANGLE_WEIGHT;
  if (ratios.wrinkle_score < CHILD_GATE.WRINKLE_SCORE_THRESHOLD)
    child_score += CHILD_GATE.WRINKLE_SCORE_WEIGHT;

  return Math.min(child_score, 1);
}

/**
 * True if child_score exceeds gate threshold (treat as child).
 */
export function isChild(childScore: number): boolean {
  return childScore > CHILD_GATE.CHILD_THRESHOLD;
}

/**
 * Child age from geometry only. Clamped to [3, 9].
 */
export function calculateChildAge(face_height_ratio: number): number {
  const age =
    CHILD_AGE.BASE + face_height_ratio * CHILD_AGE.HEIGHT_FACTOR;
  return Math.max(CHILD_AGE.MIN, Math.min(Math.round(age), CHILD_AGE.MAX));
}
