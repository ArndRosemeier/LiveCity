import { defaults, options, type CityOptions } from "./plan";
const controls: [keyof CityOptions, string, number, number, number, number][] =
  [
    ["blocks", "City extent", 4, 64, 4, 1],
    ["blockSize", "Block size", 48, 100, 2, 1],
    ["coverage", "Built density", 30, 100, 1, 100],
    ["height", "Skyline height", 8, 110, 1, 1],
    ["variety", "Architectural variety", 0, 100, 1, 100],
    ["crowds", "People per district", 0, 120, 1, 1],
    ["traffic", "Traffic per district", 0, 20, 1, 1],
    ["detail", "Facade detail", 20, 100, 1, 100],
    ["radius", "Street detail radius", 80, 360, 10, 1],
    ["budget", "Detailed districts", 2, 12, 1, 1],
  ];
export function mountControls(panel: HTMLElement, initial: CityOptions) {
  panel.innerHTML = `<div class="panel-head"><span>CITY DNA</span><span>METROPOLIS / 02</span></div><label for="seed">GENERATION SEED</label><div class="seed-row"><input id="seed" value="COMMON-GROUND" maxlength="48" aria-label="City seed"><button id="generate" title="Generate city from seed" aria-label="Generate city">↵</button><button id="random" title="Random city" aria-label="Random seed">⤨</button></div><div class="preset-row"><button data-preset="metro">Metropolis</button><button data-preset="nyc">New York scale</button><button data-preset="town">Old town</button></div><button class="primary apply" id="apply">Apply city settings ↗</button><div class="control-section">URBAN FORM</div>${controls.map(([key, label, min, max, step, mul], i) => `${i === 5 ? '<div class="control-section">STREET LIFE & DETAIL</div>' : ""}<div class="range-setting"><label for="city-${key}">${label}<output id="value-${key}"></output></label><input id="city-${key}" type="range" min="${min}" max="${max}" step="${step}" value="${initial[key] * mul}"></div>`).join("")}<div class="control-section">EXPLORE THE GRID</div><div class="district-nav"><label>East / west<input id="visit-x" type="number" min="1" value="17" aria-label="East west district"></label><label>North / south<input id="visit-z" type="number" min="1" value="17" aria-label="North south district"></label><button id="visit" class="secondary">Visit district ↗</button></div><div class="generation-status" id="stream-status" role="status">Growing street detail…</div><div class="setting"><label for="hour">Time of day</label><input id="hour" type="range" min="7" max="21" step="0.1" value="17.7"></div><div class="setting"><span>City sound</span><button class="switch" id="sound" aria-pressed="false">OFF</button></div><div class="setting"><span>Destruction tools</span><button class="switch" id="destroy" aria-pressed="false">OFF</button></div><div class="stats"><div><strong id="buildings">—</strong>BUILDINGS</div><div><strong id="people">—</strong>NEARBY PEOPLE</div><div><strong id="fps">—</strong>FPS</div></div><button class="secondary" id="restore" style="width:100%;margin-top:17px;padding:9px">Restore this city ↺</button>`;
  updateLabels();
}
export function readControls(): CityOptions {
  const values: Partial<CityOptions> = {};
  for (const [key, , , , , mul] of controls)
    values[key] =
      Number(
        (document.getElementById("city-" + key) as HTMLInputElement).value,
      ) / mul;
  return options(values);
}
export function writeControls(value: CityOptions) {
  for (const [key, , , , , mul] of controls)
    (document.getElementById("city-" + key) as HTMLInputElement).value = String(
      value[key] * mul,
    );
  updateLabels();
}
export function updateLabels() {
  const values = readControls();
  for (const [key] of controls) {
    let text = String(Math.round(values[key]));
    if (key === "blocks") text = `${text} × ${text}`;
    if (key === "blockSize" || key === "radius") text += " m";
    if (["coverage", "variety", "detail"].includes(key))
      text = Math.round(values[key] * 100) + "%";
    if (key === "height") text += " floors";
    document.getElementById("value-" + key)!.textContent = text;
  }
}
export const presets: Record<string, CityOptions> = {
  metro: defaults,
  nyc: options({
    blocks: 48,
    blockSize: 72,
    coverage: 0.97,
    height: 95,
    variety: 1,
    crowds: 60,
    traffic: 8,
    detail: 0.85,
    radius: 200,
    budget: 8,
  }),
  town: options({
    blocks: 12,
    blockSize: 52,
    coverage: 0.7,
    height: 10,
    variety: 1,
    crowds: 24,
    traffic: 3,
    detail: 1,
    radius: 150,
    budget: 6,
  }),
};
export function optionsFromUrl() {
  const query = new URLSearchParams(location.search),
    input: Partial<CityOptions> = {};
  for (const [key] of controls)
    if (query.has(key)) input[key] = Number(query.get(key));
  return options(input);
}
export function writeUrl(seed: string, value: CityOptions) {
  const url = new URL(location.href);
  url.searchParams.set("seed", seed);
  for (const [key] of controls) url.searchParams.set(key, String(value[key]));
  history.replaceState({}, "", url);
}
