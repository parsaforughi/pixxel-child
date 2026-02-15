/**
 * Age calculation with child gate. Geometry-based, client-side only.
 */

import {
  extractChildGeometryRatios,
  calculateChildScore,
  isChild,
  calculateChildAge,
  type Landmark,
} from './childDetection';

export interface SkinMetrics {
  wrinkles: number;
  texture: number;
  volume: number;
  eyeAging: number;
  skinTone: number;
  estimatedAge: number;
}

interface FaceMetrics {
  faceHeightRatio: number;
  eyeDistanceRatio: number;
  foreheadRatio: number;
  jawRatio: number;
  noseRatio: number;
  eyeOpennessRatio: number;
  lipRatio: number;
  browRatio: number;
}

function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

function extractFaceMetrics(landmarks: Landmark[]): FaceMetrics {
  const foreheadHeight = Math.abs(landmarks[10].y - landmarks[151].y);
  const eyeOpenness = Math.abs(landmarks[159].y - landmarks[145].y);
  const cheekWidth = Math.abs(landmarks[234].x - landmarks[454].x);
  const jawWidth = Math.abs(landmarks[172].x - landmarks[397].x);
  const noseLength = Math.abs(landmarks[4].y - landmarks[6].y);
  const faceHeight = Math.abs(landmarks[10].y - landmarks[152].y);
  const eyeDistance = Math.abs(landmarks[33].x - landmarks[263].x);
  const lipThickness = Math.abs(landmarks[13].y - landmarks[14].y);
  const browHeight = Math.abs(landmarks[66].y - landmarks[159].y);
  const faceWidth = Math.abs(landmarks[234].x - landmarks[454].x);

  return {
    faceHeightRatio: safeDiv(faceHeight, faceWidth),
    eyeDistanceRatio: safeDiv(eyeDistance, faceWidth),
    foreheadRatio: safeDiv(foreheadHeight, faceHeight),
    jawRatio: safeDiv(jawWidth, cheekWidth),
    noseRatio: safeDiv(noseLength, faceHeight),
    eyeOpennessRatio: safeDiv(eyeOpenness, eyeDistance),
    lipRatio: safeDiv(lipThickness, noseLength),
    browRatio: safeDiv(browHeight, foreheadHeight),
  };
}

function calculateAdultAge(metrics: FaceMetrics): SkinMetrics {
  const {
    faceHeightRatio,
    eyeDistanceRatio,
    foreheadRatio,
    jawRatio,
    noseRatio,
    eyeOpennessRatio,
    lipRatio,
    browRatio,
  } = metrics;

  const faceSignature =
    Math.abs(faceHeightRatio * 1000) +
    Math.abs(eyeDistanceRatio * 800) +
    Math.abs(foreheadRatio * 600) +
    Math.abs(jawRatio * 500) +
    Math.abs(noseRatio * 400) +
    Math.abs(eyeOpennessRatio * 300) +
    Math.abs(lipRatio * 200) +
    Math.abs(browRatio * 100);

  const signatureOffset = Math.sin(faceSignature) * 0.5 + 0.5;
  const baseFromSignature = 20 + signatureOffset * 35;
  const youthScore =
    eyeOpennessRatio * 10 + lipRatio * 5 - foreheadRatio * 3;
  const adjustment = Math.max(
    -5,
    Math.min(5, (youthScore - 1.5) * 3)
  );
  const rawAge = baseFromSignature + adjustment;
  const finalAge = Math.min(55, Math.max(20, Math.round(rawAge)));
  const agePercent = (finalAge - 20) / 35;

  return {
    wrinkles: Math.min(
      75,
      Math.max(5, Math.round(5 + agePercent * 60 + signatureOffset * 10))
    ),
    eyeAging: Math.min(
      60,
      Math.max(3, Math.round(3 + agePercent * 45 + signatureOffset * 12))
    ),
    texture: Math.min(
      98,
      Math.max(60, Math.round(95 - agePercent * 25 - signatureOffset * 10))
    ),
    volume: Math.min(
      98,
      Math.max(55, Math.round(95 - agePercent * 30 - signatureOffset * 10))
    ),
    skinTone: Math.min(
      25,
      Math.max(3, Math.round(5 + agePercent * 15 + signatureOffset * 5))
    ),
    estimatedAge: finalAge,
  };
}

/**
 * Child-appropriate sub-metrics from age 3–14 (low aging signs).
 */
function metricsForChildAge(age: number): Omit<SkinMetrics, 'estimatedAge'> {
  const agePercentChild = (age - 3) / 11; // 0 to 1 over 3–14
  return {
    wrinkles: Math.min(20, Math.max(5, Math.round(5 + agePercentChild * 12))),
    eyeAging: Math.min(15, Math.max(3, Math.round(3 + agePercentChild * 10))),
    texture: Math.max(85, Math.round(98 - agePercentChild * 10)),
    volume: Math.max(88, Math.round(95 - agePercentChild * 5)),
    skinTone: Math.min(12, Math.max(3, Math.round(4 + agePercentChild * 6))),
  };
}

/**
 * Single entry: child gate then adult or child age. No UI change.
 */
export function calculateMetrics(
  landmarks: Landmark[]
): SkinMetrics {
  const childRatios = extractChildGeometryRatios(landmarks);
  const child_score = calculateChildScore(childRatios);

  if (isChild(child_score)) {
    const estimatedAge = calculateChildAge(childRatios.face_height_ratio);
    const sub = metricsForChildAge(estimatedAge);
    return { ...sub, estimatedAge };
  }

  const faceMetrics = extractFaceMetrics(landmarks);
  return calculateAdultAge(faceMetrics);
}
