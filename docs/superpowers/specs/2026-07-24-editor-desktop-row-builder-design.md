# Editor Desktop Row Builder Design

## Goal

Allow editors to compose the desktop page grid row by row, using a different
column arrangement on each row and explicitly assigning a visible content
block to every slot.

## Interaction

The advanced grid designer gains a "Desktop rows" builder above the existing
12-column canvas. Each row has:

- reorder up/down controls;
- a layout selector for full width, two equal columns, three equal columns,
  four equal columns, narrow/content, or content/narrow;
- one content selector per slot;
- a delete-row action.

"Add row" appends a full-width empty row. Content selectors list visible blocks
that are not assigned to another slot. A block may appear only once.

Changing a row layout preserves assignments from left to right when possible.
Assignments displaced by a smaller layout return to the unassigned list.
Deleting a row also returns its blocks to the unassigned list.

## Validation

Every visible content block must be assigned exactly once. Hidden blocks do not
need an assignment and cannot be selected. The editor shows unassigned blocks
beside the row builder and blocks applying an incomplete or duplicate row
configuration.

## Data Model

No persisted schema change is required. Row configurations are derived from and
written back to the existing `WebsiteLayout` version 1 placements:

- full width: `12`;
- two equal: `6 + 6`;
- three equal: `4 + 4 + 4`;
- four equal: `3 + 3 + 3 + 3`;
- narrow/content: `4 + 8`;
- content/narrow: `8 + 4`.

Opening an existing layout groups blocks with the same desktop row into a row
configuration. Applying row changes rewrites desktop row, column, and width
while retaining each block's height. Reading order follows row order and then
slot order.

## Advanced Canvas

The existing freeform 12-column canvas remains below the row builder. Manual
dragging and resizing continue to work. Any canvas change is immediately
re-derived into the row builder, including custom arrangements that do not
match a preset. Such rows show a "Custom" layout state until a preset is
selected.

## Responsive Behavior

Only desktop placement changes. Tablet and mobile continue to stack visible
blocks according to semantic reading order.

## Accessibility And Feedback

All icon controls have tooltips and accessible names. Slot selectors use the
content labels already supplied to the layout editor. Status messages explain
invalid or incomplete assignments in plain language. Keyboard users can reorder
rows and operate all selectors without using the canvas.

## Testing

Unit tests cover deriving rows, applying presets, assignment preservation,
duplicate/missing validation, row reorder, and translation to 12-column
placements. Component tests cover selecting layouts and blocks. Existing layout
schema, command, editor, and publishing tests must remain green. Desktop and
mobile screenshots verify that the editor is usable and the published preview
does not overlap.
