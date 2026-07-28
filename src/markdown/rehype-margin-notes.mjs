// pattern: Mixed (unavoidable)
// Reason: unified's rehype transformer API requires annotating its generated HAST in place.

export default function rehypeMarginNotes() {
  return function transform(tree) {
    const references = [];
    const definitionsById = new Map();
    let hasInvalidCoverage = false;

    walk(tree, (node, context) => {
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
        } else {
          hasInvalidCoverage = true;
        }
      }

      if (context === "footnote-list" && node.tagName === "li") {
        const definitionId = getStringProperty(node.properties, "id");

        if (!definitionId || definitionsById.has(definitionId)) {
          hasInvalidCoverage = true;
        } else {
          definitionsById.set(definitionId, node);
        }
      }
    });

    const firstReferenceByDefinition = new Map();

    references.forEach(({ definitionId, referenceId }) => {
      const definition = definitionsById.get(definitionId);

      if (!definition) {
        hasInvalidCoverage = true;
        return;
      }

      if (!firstReferenceByDefinition.has(definitionId)) {
        firstReferenceByDefinition.set(definitionId, referenceId);
      }
    });

    if (
      new Set(references.map(({ referenceId }) => referenceId)).size !==
      references.length
    ) {
      hasInvalidCoverage = true;
    }

    if (firstReferenceByDefinition.size !== definitionsById.size) {
      hasInvalidCoverage = true;
    }

    if (
      hasInvalidCoverage ||
      references.length === 0 ||
      definitionsById.size === 0
    ) {
      return tree;
    }

    references.forEach(({ node, definitionId }) => {
      annotateReference(node, definitionId);
    });

    firstReferenceByDefinition.forEach((referenceId, definitionId) => {
      const definition = definitionsById.get(definitionId);
      definition.properties.dataMarginNoteAnchor = referenceId;
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

function walk(node, visit, context = "root") {
  if (!isRecord(node)) {
    return;
  }

  visit(node, context);

  let nextContext = context;

  if (node.type === "element" && isRecord(node.properties)) {
    if (hasProperty(node.properties, "dataFootnotes")) {
      nextContext = "footnotes";
    } else if (context === "footnotes" && node.tagName === "ol") {
      nextContext = "footnote-list";
    } else if (context === "footnote-list" && node.tagName === "li") {
      nextContext = "footnote-definition";
    }
  }

  if (!Array.isArray(node.children)) {
    return;
  }

  node.children.forEach((child) => walk(child, visit, nextContext));
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
