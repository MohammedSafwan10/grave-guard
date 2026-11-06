import timesTables from "../data/packs/times-tables.json";
import { parsePack, type QuestionPack } from "./pack";

/** Packs that ship with the game, so it works offline with no AI. */
export function builtinPacks(): QuestionPack[] {
  return [parsePack(timesTables)];
}
