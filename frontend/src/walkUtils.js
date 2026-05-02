/** Earth radius in meters */
const R = 6371000;

export function haversineM(lat1, lon1, lat2, lon2) {
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLon = toR(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function polylineLengthM(coordsLonLat) {
  if (!coordsLonLat?.length || coordsLonLat.length < 2) return 0;
  let t = 0;
  for (let i = 0; i < coordsLonLat.length - 1; i++) {
    const [lo1, la1] = coordsLonLat[i];
    const [lo2, la2] = coordsLonLat[i + 1];
    t += haversineM(la1, lo1, la2, lo2);
  }
  return t;
}

function projectPointToSegment(lat, lon, lat1, lon1, lat2, lon2) {
  const cosMid = Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  const x = (lon - lon1) * cosMid;
  const y = lat - lat1;
  const dx = (lon2 - lon1) * cosMid;
  const dy = lat2 - lat1;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 1e-18 ? (x * dx + y * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const plat = lat1 + dy * t;
  const plon = lon1 + (lon2 - lon1) * t;
  const distM = haversineM(lat, lon, plat, plon);
  return { t, distM };
}

/**
 * Snap user position to polyline [[lon,lat], ...]; returns distance along route from start.
 */
export function projectAlongPolyline(lat, lon, coordsLonLat) {
  if (!coordsLonLat?.length || coordsLonLat.length < 2) {
    return { distanceAlongM: 0, crossTrackM: Infinity, totalM: 0 };
  }
  let bestAlong = 0;
  let bestCross = Infinity;
  let acc = 0;
  for (let i = 0; i < coordsLonLat.length - 1; i++) {
    const [lo1, la1] = coordsLonLat[i];
    const [lo2, la2] = coordsLonLat[i + 1];
    const segLen = haversineM(la1, lo1, la2, lo2);
    const p = projectPointToSegment(lat, lon, la1, lo1, la2, lo2);
    const along = acc + p.t * segLen;
    if (p.distM < bestCross) {
      bestCross = p.distM;
      bestAlong = along;
    }
    acc += segLen;
  }
  const totalM = acc;
  return {
    distanceAlongM: Math.min(Math.max(0, bestAlong), totalM),
    crossTrackM: bestCross,
    totalM,
  };
}

export function enrichStepsWithCumulative(steps) {
  if (!steps?.length) return [];
  let acc = 0;
  return steps.map((s, index) => {
    const cumStartM = acc;
    const d = Number(s.distance_m) || 0;
    acc += d;
    return {
      ...s,
      index,
      cumStartM,
      cumEndM: acc,
    };
  });
}

export function computeWalkSnapshot(
  enrichedSteps,
  distanceAlongM,
  totalM,
  durationMin,
  crossTrackM = Infinity
) {
  const remainingM = Math.max(0, totalM - distanceAlongM);
  const progressPct = totalM > 0 ? (distanceAlongM / totalM) * 100 : 0;
  const etaMin = totalM > 0 ? (remainingM / totalM) * durationMin : 0;

  if (!enrichedSteps.length) {
    return {
      progressPct,
      remainingM,
      etaMin,
      currentStep: null,
      nextInstruction: null,
      remainingStepM: 0,
      atDestination: false,
      stepIndex: 0,
    };
  }

  let stepIndex = 0;
  for (let i = 0; i < enrichedSteps.length; i++) {
    if (distanceAlongM < enrichedSteps[i].cumEndM - 0.25) {
      stepIndex = i;
      break;
    }
    stepIndex = i;
  }

  const step = enrichedSteps[stepIndex];
  const remainingStepM = Math.max(0, step.cumEndM - distanceAlongM);
  const atDestination = remainingM < 25 && crossTrackM < 80;

  return {
    progressPct,
    remainingM,
    etaMin,
    currentStep: step,
    nextInstruction: step?.instruction || "Continue",
    remainingStepM,
    atDestination,
    stepIndex,
  };
}
