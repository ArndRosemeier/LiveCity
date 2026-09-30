import type * as T from "three";
import type { Part, Building } from "./world";
import type { Actor } from "./inhabitants";
export interface WorldLike {
  root: T.Group;
  parts: Part[];
  buildings: Building[];
  citizens: Actor[];
  cars: Actor[];
  population: number;
  remove(part: Part): void;
}
