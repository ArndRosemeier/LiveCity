export class Random {
  private state: number;
  constructor(seed: string) {
    let h = 2166136261;
    for (const c of seed) {
      h ^= c.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    this.state = h >>> 0;
  }
  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number) {
    return Math.floor(this.range(a, b + 1));
  }
  pick<T>(list: T[]) {
    return list[Math.floor(this.next() * list.length)];
  }
}
