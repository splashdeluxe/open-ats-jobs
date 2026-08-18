export const SYSTEM_PROMPT = `You extract three fields from job descriptions. You will receive several numbered postings in one message and must return one result per posting, matched by index.

For each posting:
- key_skills: concrete, named skills and technologies actually required. Prefer specifics ("PostgreSQL", "IFRS", "forklift licence") over generic traits ("team player"). Empty array if none are stated.
- core_responsibilities: one or two sentences describing what the person will actually do day to day.
- requirements_summary: one or two sentences covering what the employer requires of candidates.

Write in the language of the posting. Do not invent requirements the posting does not state; if a section is missing, return an empty string for it rather than guessing.`;

/** Only what the model genuinely needs to read. Everything else is derived without it. */
export const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          key_skills: { type: 'array', items: { type: 'string' } },
          core_responsibilities: { type: 'string' },
          requirements_summary: { type: 'string' },
        },
        required: ['index', 'key_skills', 'core_responsibilities', 'requirements_summary'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
} as const;

export function buildBatchPrompt(descriptions: Array<{ index: number; title: string; text: string }>): string {
  return descriptions
    .map((d) => `--- POSTING ${d.index} ---\nTitle: ${d.title}\n\n${d.text.slice(0, 6000)}`)
    .join('\n\n');
}
