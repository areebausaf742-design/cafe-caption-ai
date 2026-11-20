/**
 * Stable React keys for menu rows.
 *
 * Menu items have no id — they arrive from OCR, from the server, and from the
 * owner typing. Keying rows by array index means deleting row 3 visually
 * "becomes" the old row 4, so an open editor, a focused input or an in-flight
 * 3D preview can end up attached to the wrong dish; keying by name means the
 * component remounts on every keystroke and the cursor jumps out of the field.
 *
 * A per-object id gives both: identity follows the row through renames and
 * re-ordering, and it disappears with the object (a WeakMap, so nothing leaks).
 */
export type RowIds = {
  idFor: (row: object) => string;
};

export function createRowIds(prefix = "row"): RowIds {
  const ids = new WeakMap<object, string>();
  let next = 0;

  return {
    idFor(row: object) {
      let id = ids.get(row);
      if (!id) {
        id = `${prefix}-${next++}`;
        ids.set(row, id);
      }
      return id;
    },
  };
}
