import { generateDistrict } from "./generation";
import type { DistrictPlan } from "./plan";
self.onmessage = (
  event: MessageEvent<{
    generation: number;
    district: DistrictPlan;
    detail: number;
  }>,
) => {
  const { generation, district, detail } = event.data;
  try {
    const result = generateDistrict(district, detail);
    self.postMessage(
      { generation, result },
      { transfer: [result.parts.buffer] },
    );
  } catch (error) {
    self.postMessage({
      generation,
      error: String(error),
      district: district.id,
    });
  }
};
