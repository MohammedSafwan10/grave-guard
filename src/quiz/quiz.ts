import { createRng, nextFloat, type Rng } from "../sim/rng";
import type { AnswerResult } from "../sim/types";
import type { Question, QuestionPack } from "./pack";

export const RECENT_WINDOW = 10;

export interface QuizState {
  rng: Rng;
  recent: string[];
  topicMistakes: Record<string, number>;
  missedIds: string[];
}

export interface Quiz {
  readonly pack: QuestionPack;
  readonly state: QuizState;
  /** Pick the next question. Boss questions prefer the hardest ones. */
  next(opts?: { boss?: boolean }): Question;
  /** Check an answer. `msTaken` decides the fast bonus. */
  submit(
    q: Question,
    choice: number,
    msTaken: number,
    opts?: { boss?: boolean; fastMs?: number },
  ): AnswerResult;
  byId(id: string): Question | undefined;
}

export function createQuiz(pack: QuestionPack, seed: number): Quiz {
  const state: QuizState = {
    rng: createRng(seed ^ 0x9e3779b9),
    recent: [],
    topicMistakes: {},
    missedIds: [],
  };
  const index = new Map(pack.questions.map((q) => [q.id, q]));
  const window = Math.min(RECENT_WINDOW, pack.questions.length - 1);

  function weight(q: Question): number {
    // Adaptive revision: topics you miss come back twice as often; a question you missed comes back more.
    let w = (state.topicMistakes[q.topic] ?? 0) > 0 ? 2 : 1;
    if (state.missedIds.includes(q.id)) w *= 1.5;
    return w;
  }

  function next(opts: { boss?: boolean } = {}): Question {
    const recent = new Set(state.recent.slice(-window));
    let pool = pack.questions.filter((q) => !recent.has(q.id));
    if (opts.boss) {
      const hard = pool.filter((q) => q.difficulty === 3);
      if (hard.length > 0) pool = hard;
    }
    const total = pool.reduce((a, q) => a + weight(q), 0);
    let r = nextFloat(state.rng) * total;
    let pick = pool[pool.length - 1];
    for (const q of pool) {
      r -= weight(q);
      if (r <= 0) {
        pick = q;
        break;
      }
    }
    if (!pick) throw new Error("Question pack is empty");
    state.recent.push(pick.id);
    if (state.recent.length > RECENT_WINDOW * 2) state.recent.splice(0, state.recent.length - RECENT_WINDOW);
    return pick;
  }

  function submit(
    q: Question,
    choice: number,
    msTaken: number,
    opts: { boss?: boolean; fastMs?: number } = {},
  ): AnswerResult {
    const correct = choice === q.answer;
    if (!correct) {
      state.topicMistakes[q.topic] = (state.topicMistakes[q.topic] ?? 0) + 1;
      if (!state.missedIds.includes(q.id)) state.missedIds.push(q.id);
    } else if ((state.topicMistakes[q.topic] ?? 0) > 0) {
      // Getting it right slowly "heals" the topic.
      state.topicMistakes[q.topic] = (state.topicMistakes[q.topic] ?? 1) - 0.5;
    }
    return {
      questionId: q.id,
      correct,
      fast: correct && msTaken < (opts.fastMs ?? 5000),
      boss: opts.boss === true,
    };
  }

  return { pack, state, next, submit, byId: (id) => index.get(id) };
}
