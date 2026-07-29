export function transformBuildingLocalXZ(building, point) {
  const values = [
    building?.x, building?.z, building?.rotation?.x, building?.rotation?.y,
    building?.rotation?.z, point?.x, point?.z,
  ];
  if (!values.every(Number.isFinite)) return null;
  if (Math.abs(building.rotation.x) > 1e-6 || Math.abs(building.rotation.z) > 1e-6) return null;
  const cosine = Math.cos(building.rotation.y);
  const sine = Math.sin(building.rotation.y);
  return {
    x: building.x + point.x * cosine + point.z * sine,
    z: building.z - point.x * sine + point.z * cosine,
  };
}
