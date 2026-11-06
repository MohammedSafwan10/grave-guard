import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { builtinPacks } from "../src/quiz/builtin";
import { parsePack, type QuestionPack } from "../src/quiz/pack";
import { createQuiz, RECENT_WINDOW } from "../src/quiz/quiz";

const pack = builtinPacks()[0]!;

describe("question packs", () => {
  it("built-in packs are valid and balanced", () => {
    for (const p of builtinPacks()) {
      const slots = [0, 0, 0, 0];
      p.questions.forEach((q) => slots[q.answer]!++);
      expect(Math.max(...slots) - Math.min(...slots)).toBeLessThanOrEqual(2);
    }
  });

  it("rejects packs with duplicate choices or ids", () => {
    const q = pack.questions[0]!;
    expect(() => parsePack({ ...pack, questions: [...pack.questions, q] })).toThrow();
    const dup = { ...q, id: "dup", choices: ["1", "1", "2", "3"] };
    expect(() => parsePack({ ...pack, questions: [...pack.questions, dup] })).toThrow();
  });
});

describe("quiz picking", () => {
  it("never repeats a question within the recent window", () => {
    fc.assert(
      fc.property(fc.integer(), fc.array(fc.boolean(), { minLength: 30, maxLength: 120 }), (seed, answers) => {
        const quiz = createQuiz(pack, seed);
        const seen: string[] = [];
        for (const right of answers) {
          const q = quiz.next();
          expect(seen.slice(-RECENT_WINDOW)).not.toContain(q.id);
          seen.push(q.id);
          quiz.submit(q, right ? q.answer : (q.answer + 1) % 4, 3000);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("is deterministic for a seed", () => {
    const a = createQuiz(pack, 7);
    const b = createQuiz(pack, 7);
    for (let i = 0; i < 50; i++) expect(b.next().id).toBe(a.next().id);
  });

  it("works with the smallest allowed pack (4 questions)", () => {
    const small: QuestionPack = { ...pack, questions: pack.questions.slice(0, 4) };
    const quiz = createQuiz(small, 1);
    let last = "";
    for (let i = 0; i < 20; i++) {
      const q = quiz.next();
      expect(q.id).not.toBe(last);
      last = q.id;
    }
  });

  it("asks more about topics you get wrong", () => {
    const quiz = createQuiz(pack, 3);
    const weak = pack.questions[0]!.topic;
    for (const q of pack.questions.filter((x) => x.topic === weak)) quiz.submit(q, (q.answer + 1) % 4, 3000);
    const share = (n: number) => {
      let hits = 0;
      for (let i = 0; i < n; i++) if (quiz.next().topic === weak) hits++;
      return hits / n;
    };
    const base = pack.questions.filter((q) => q.topic === weak).length / pack.questions.length;
    expect(share(600)).toBeGreaterThan(base * 1.4);
  });

  it("scores fast and boss answers", () => {
    const quiz = createQuiz(pack, 1);
    const q = quiz.next();
    expect(quiz.submit(q, q.answer, 2000, { boss: true })).toMatchObject({ correct: true, fast: true, boss: true });
    expect(quiz.submit(q, q.answer, 9000)).toMatchObject({ correct: true, fast: false });
    expect(quiz.submit(q, (q.answer + 1) % 4, 100)).toMatchObject({ correct: false, fast: false });
  });
});
