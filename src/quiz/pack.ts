import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);

export const QuestionSchema = z.object({
  id: text(80),
  topic: text(60),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  prompt: text(220),
  choices: z.tuple([text(90), text(90), text(90), text(90)]),
  answer: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  explain: text(280),
});

export const QuestionPackSchema = z
  .object({
    id: text(60),
    title: text(80),
    subject: text(40),
    questions: z.array(QuestionSchema).min(4).max(300),
  })
  .superRefine((pack, ctx) => {
    const ids = new Set<string>();
    pack.questions.forEach((q, i) => {
      if (ids.has(q.id)) ctx.addIssue({ code: "custom", message: `Duplicate question id ${q.id}`, path: ["questions", i] });
      ids.add(q.id);
      const lower = q.choices.map((c) => c.toLowerCase());
      if (new Set(lower).size !== 4)
        ctx.addIssue({ code: "custom", message: `Question ${q.id} has duplicate choices`, path: ["questions", i] });
    });
  });

export type Question = z.infer<typeof QuestionSchema>;
export type QuestionPack = z.infer<typeof QuestionPackSchema>;

/** Validate a pack from any source (built-in JSON, AI forge, shared link). */
export function parsePack(raw: unknown): QuestionPack {
  return QuestionPackSchema.parse(raw);
}
