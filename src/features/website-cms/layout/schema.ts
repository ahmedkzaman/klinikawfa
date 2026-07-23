import { z } from "zod";

import {
  WEBSITE_GRID_COLUMNS,
  WEBSITE_GRID_MAX_HEIGHT,
  WEBSITE_GRID_MAX_ROW,
  WEBSITE_LAYOUT_MAX_BLOCKS,
  type WebsiteLayout,
} from "./types";

type LayoutKinds = readonly [string, ...string[]];

const safeIdentifierSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:[-_:][a-z0-9]+)*$/);

function blocksOverlap(
  first: { column: number; width: number; row: number; height: number },
  second: { column: number; width: number; row: number; height: number },
) {
  const firstRight = first.column + first.width;
  const secondRight = second.column + second.width;
  const firstBottom = first.row + first.height;
  const secondBottom = second.row + second.height;

  return (
    first.column < secondRight &&
    second.column < firstRight &&
    first.row < secondBottom &&
    second.row < firstBottom
  );
}

export function websiteLayoutSchema<const Kinds extends LayoutKinds>(
  kinds: Kinds,
) {
  const placementSchema = z
    .object({
      column: z.number().int().min(1).max(WEBSITE_GRID_COLUMNS),
      width: z.number().int().min(1).max(WEBSITE_GRID_COLUMNS),
      row: z.number().int().min(1).max(WEBSITE_GRID_MAX_ROW),
      height: z.number().int().min(1).max(WEBSITE_GRID_MAX_HEIGHT),
    })
    .strict()
    .superRefine((placement, context) => {
      if (placement.column + placement.width - 1 > WEBSITE_GRID_COLUMNS) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Block must stay within ${WEBSITE_GRID_COLUMNS} columns`,
          path: ["width"],
        });
      }
    });

  const blockSchema = z
    .object({
      id: safeIdentifierSchema,
      kind: z.enum(kinds),
      contentRef: safeIdentifierSchema,
      order: z.number().int().min(0).max(WEBSITE_LAYOUT_MAX_BLOCKS - 1),
      hidden: z.boolean(),
      desktop: placementSchema,
    })
    .strict();

  return z
    .object({
      version: z.literal(1),
      blocks: z.array(blockSchema).min(1).max(WEBSITE_LAYOUT_MAX_BLOCKS),
    })
    .strict()
    .superRefine((layout, context) => {
      const ids = new Set<string>();
      const contentRefs = new Set<string>();
      const orders = new Set<number>();

      layout.blocks.forEach((block, index) => {
        if (ids.has(block.id)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Block IDs must be unique",
            path: ["blocks", index, "id"],
          });
        }
        ids.add(block.id);

        if (contentRefs.has(block.contentRef)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Content references must be unique",
            path: ["blocks", index, "contentRef"],
          });
        }
        contentRefs.add(block.contentRef);

        if (orders.has(block.order)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Block order must be unique",
            path: ["blocks", index, "order"],
          });
        }
        orders.add(block.order);

        for (let previous = 0; previous < index; previous += 1) {
          if (
            blocksOverlap(
              layout.blocks[previous].desktop,
              block.desktop,
            )
          ) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Blocks cannot overlap",
              path: ["blocks", index, "desktop"],
            });
            break;
          }
        }
      });

      const sortedOrders = [...orders].sort((left, right) => left - right);
      const contiguous = sortedOrders.every((order, index) => order === index);
      if (!contiguous || sortedOrders.length !== layout.blocks.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Block order must be contiguous from zero",
          path: ["blocks"],
        });
      }
    });
}

export function parseWebsiteLayout<const Kinds extends LayoutKinds>(
  value: unknown,
  kinds: Kinds,
): WebsiteLayout<Kinds[number]> | null {
  const result = websiteLayoutSchema(kinds).safeParse(value);
  return result.success
    ? (result.data as WebsiteLayout<Kinds[number]>)
    : null;
}
