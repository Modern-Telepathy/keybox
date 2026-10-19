/**
 * Compatibility re-export. The Cursor installer lives with the other hosts
 * in src/install. Existing imports of installCursor keep working.
 */

export { installCursor } from "./install/cursor.js";
