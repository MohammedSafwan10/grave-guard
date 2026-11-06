import defenders from "../data/defenders.json";
import enemies from "../data/enemies.json";
import levels from "../data/levels.json";
import rules from "../data/rules.json";
import { parseConfig, type GameConfig } from "./config";

/** The game's built-in config, validated once. */
export function loadGameConfig(): GameConfig {
  return parseConfig({ rules, defenders, enemies, levels });
}
