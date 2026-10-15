/**
 * Forbids user-facing text written in components (CLAUDE.md, «Lingue»).
 * Texts live only in the translation files read by next-intl.
 */
const TEXT_ATTRIBUTES = new Set(["title", "placeholder", "alt", "aria-label", "label"]);
const HAS_LETTER = /\p{L}/u;
const MESSAGE = "User-facing text must come from the translation files, not from the component.";

/** @type {import("eslint").Rule.RuleModule} */
export const noUiLiterals = {
  meta: {
    type: "problem",
    docs: { description: "Disallow hard-coded user-facing text in JSX" },
    schema: [],
    messages: { literal: MESSAGE },
  },
  create(context) {
    const isText = (value) => typeof value === "string" && HAS_LETTER.test(value);
    const literalOf = (value) => {
      if (value?.type === "Literal") return value;
      if (value?.type === "JSXExpressionContainer" && value.expression.type === "Literal") {
        return value.expression;
      }
      return null;
    };
    /** A string the expression may render: literals, templates, and both branches of `?:`, `&&`, `||`, `??`. */
    const rendersText = (expression) => {
      switch (expression?.type) {
        case "Literal":
          return isText(expression.value);
        case "TemplateLiteral":
          return expression.quasis.some((quasi) => isText(quasi.value.cooked));
        case "ConditionalExpression":
          return rendersText(expression.consequent) || rendersText(expression.alternate);
        case "LogicalExpression":
          return rendersText(expression.left) || rendersText(expression.right);
        default:
          return false;
      }
    };
    return {
      JSXText(node) {
        if (isText(node.value)) context.report({ node, messageId: "literal" });
      },
      JSXExpressionContainer(node) {
        if (node.parent?.type === "JSXAttribute") return;
        if (rendersText(node.expression)) context.report({ node, messageId: "literal" });
      },
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || !TEXT_ATTRIBUTES.has(node.name.name)) return;
        const literal = literalOf(node.value);
        if (literal && isText(literal.value)) context.report({ node, messageId: "literal" });
      },
    };
  },
};
