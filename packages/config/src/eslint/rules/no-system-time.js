/**
 * Forbids reading the system clock directly (CLAUDE.md rule 6).
 * The current time must come from the `Clock` port; only its system
 * implementation is exempted, through the shared ESLint config.
 * `new Date(value)` stays allowed: it parses, it does not read the clock.
 */
const MESSAGE =
  "Read the current time from the Clock port, not from Date.now() or new Date() (CLAUDE.md rule 6).";

/** @type {import("eslint").Rule.RuleModule} */
export const noSystemTime = {
  meta: {
    type: "problem",
    docs: { description: "Disallow Date.now(), new Date() and Date() without arguments" },
    schema: [],
    messages: { systemTime: MESSAGE },
  },
  create(context) {
    const isDate = (node) => node.type === "Identifier" && node.name === "Date";
    return {
      NewExpression(node) {
        if (isDate(node.callee) && node.arguments.length === 0) {
          context.report({ node, messageId: "systemTime" });
        }
      },
      CallExpression(node) {
        const { callee } = node;
        if (isDate(callee)) {
          context.report({ node, messageId: "systemTime" });
          return;
        }
        if (
          callee.type === "MemberExpression" &&
          isDate(callee.object) &&
          callee.property.type === "Identifier" &&
          callee.property.name === "now"
        ) {
          context.report({ node, messageId: "systemTime" });
        }
      },
    };
  },
};
