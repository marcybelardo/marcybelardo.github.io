// pattern: Mixed (unavoidable)
// Reason: unified's rehype transformer API requires annotating its generated HAST in place.

export default function rehypeMarginNotes() {
  return function transform(tree) {
    const references = [];
    const definitionsById = new Map();

    walk(tree, (node) => {
      if (node.type !== "element" || !isRecord(node.properties)) {
        return;
      }

      if (
        hasProperty(node.properties, "dataFootnoteRef") ||
        hasProperty(node.properties, "data-footnote-ref")
      ) {
        const href = getStringProperty(node.properties, "href");
        const referenceId = getStringProperty(node.properties, "id");

        if (href?.startsWith("#") && href.length > 1 && referenceId) {
          references.push({
            node,
            definitionId: href.slice(1),
            referenceId,
          });
        }
      }

      if (
        node.tagName === "li" &&
        typeof node.properties.id === "string" &&
        node.properties.id.length > 0
      ) {
        definitionsById.set(node.properties.id, node);
      }
    });

    const firstReferenceByDefinition = new Set();

    references.forEach(({ node, definitionId, referenceId }) => {
      const definition = definitionsById.get(definitionId);

      if (
        !definition ||
        !isRecord(definition.properties) ||
        firstReferenceByDefinition.has(definitionId)
      ) {
        if (definition && isRecord(definition.properties)) {
          annotateReference(node, definitionId);
        }
        return;
      }

      annotateReference(node, definitionId);
      definition.properties.dataMarginNoteAnchor = referenceId;
      firstReferenceByDefinition.add(definitionId);
    });

    return tree;
  };
}

function annotateReference(node, definitionId) {
  if (!isRecord(node.properties)) {
    node.properties = {};
  }

  node.properties.dataMarginNoteRef = definitionId;
}

function walk(node, visit) {
  if (!isRecord(node)) {
    return;
  }

  visit(node);

  if (!Array.isArray(node.children)) {
    return;
  }

  node.children.forEach((child) => walk(child, visit));
}

function hasProperty(properties, key) {
  return Object.hasOwn(properties, key);
}

function getStringProperty(properties, key) {
  const value = properties[key];

  return typeof value === "string" ? value : null;
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
