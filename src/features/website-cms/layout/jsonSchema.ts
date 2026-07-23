import {
  WEBSITE_GRID_COLUMNS,
  WEBSITE_GRID_MAX_HEIGHT,
  WEBSITE_GRID_MAX_ROW,
  WEBSITE_LAYOUT_MAX_BLOCKS,
} from "./types";

export function websiteLayoutJsonSchema<const K extends readonly string[]>(
  kinds: K,
) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["version", "blocks"],
    properties: {
      version: { type: "integer", enum: [1] },
      blocks: {
        type: "array",
        minItems: 1,
        maxItems: WEBSITE_LAYOUT_MAX_BLOCKS,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "kind", "contentRef", "order", "hidden", "desktop"],
          properties: {
            id: {
              type: "string",
              minLength: 1,
              maxLength: 80,
              pattern: "^[a-z0-9]+(?:[-_:][a-z0-9]+)*$",
            },
            kind: { enum: kinds },
            contentRef: {
              type: "string",
              minLength: 1,
              maxLength: 80,
              pattern: "^[a-z0-9]+(?:[-_:][a-z0-9]+)*$",
            },
            order: { type: "integer", minimum: 0, maximum: WEBSITE_LAYOUT_MAX_BLOCKS - 1 },
            hidden: { type: "boolean" },
            desktop: {
              type: "object",
              additionalProperties: false,
              required: ["column", "width", "row", "height"],
              properties: {
                column: { type: "integer", minimum: 1, maximum: WEBSITE_GRID_COLUMNS },
                width: { type: "integer", minimum: 1, maximum: WEBSITE_GRID_COLUMNS },
                row: { type: "integer", minimum: 1, maximum: WEBSITE_GRID_MAX_ROW },
                height: { type: "integer", minimum: 1, maximum: WEBSITE_GRID_MAX_HEIGHT },
              },
            },
          },
        },
      },
    },
  } as const;
}
