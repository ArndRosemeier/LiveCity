import { HumanSurface } from "./human-surface";
import {
  humanRestRig,
  packHuman,
  humanTransfers,
  type HumanProfile,
} from "./human-geometry";
self.onmessage = (
  event: MessageEvent<{ id: number; profile: HumanProfile }>,
) => {
  try {
    const surface = new HumanSurface(
        humanRestRig(event.data.profile),
        undefined,
        true,
      ),
      data = packHuman(surface.mesh.geometry);
    surface.dispose();
    (self as unknown as Worker).postMessage(
      { id: event.data.id, data },
      humanTransfers(data),
    );
  } catch (error) {
    self.postMessage({ id: event.data.id, error: String(error) });
  }
};
