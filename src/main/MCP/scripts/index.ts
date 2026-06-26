/**
 * scripts/index.ts -- Figma Plugin API query/mutation snippets.
 *
 * Each template returns a string of JS that runs inside the Figma webapp
 * renderer context via webContents.executeJavaScript(). Extracted verbatim
 * from McpServer.ts (Phase 2 of decomposition); no behavior change.
 */

// ── Figma Plugin API Queries ───────────────────────────────────────────────────
// These JS snippets run inside the Figma webapp's renderer context via
// webContents.executeJavaScript(). They use the internal Figma scene graph
// that's available in the global scope.

export const DESIGN_CONTEXT_SCRIPT = (nodeId: string | null, depth: number) => `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return JSON.stringify({ error: "Figma Plugin API not available — ensure a file is open and fully loaded" });

    function serializeNode(node, currentDepth, maxDepth) {
      if (!node || currentDepth > maxDepth) return null;
      const result = {
        id: node.id,
        name: node.name,
        type: node.type,
        visible: node.visible,
      };

      // Layout
      if ('x' in node) result.x = node.x;
      if ('y' in node) result.y = node.y;
      if ('width' in node) result.width = node.width;
      if ('height' in node) result.height = node.height;
      if ('rotation' in node) result.rotation = node.rotation;
      if ('opacity' in node) result.opacity = node.opacity;

      // Auto-layout
      if ('layoutMode' in node && node.layoutMode !== 'NONE') {
        result.layoutMode = node.layoutMode;
        result.primaryAxisSizingMode = node.primaryAxisSizingMode;
        result.counterAxisSizingMode = node.counterAxisSizingMode;
        result.primaryAxisAlignItems = node.primaryAxisAlignItems;
        result.counterAxisAlignItems = node.counterAxisAlignItems;
        result.paddingLeft = node.paddingLeft;
        result.paddingRight = node.paddingRight;
        result.paddingTop = node.paddingTop;
        result.paddingBottom = node.paddingBottom;
        result.itemSpacing = node.itemSpacing;
      }

      // Sizing constraints
      if ('constraints' in node) result.constraints = node.constraints;
      if ('layoutSizingHorizontal' in node) result.layoutSizingHorizontal = node.layoutSizingHorizontal;
      if ('layoutSizingVertical' in node) result.layoutSizingVertical = node.layoutSizingVertical;

      // Fills, strokes, effects
      if ('fills' in node) {
        try { result.fills = JSON.parse(JSON.stringify(node.fills)); } catch(e) {}
      }
      if ('strokes' in node) {
        try { result.strokes = JSON.parse(JSON.stringify(node.strokes)); } catch(e) {}
      }
      if ('effects' in node) {
        try { result.effects = JSON.parse(JSON.stringify(node.effects)); } catch(e) {}
      }
      if ('strokeWeight' in node) result.strokeWeight = node.strokeWeight;
      if ('cornerRadius' in node) result.cornerRadius = node.cornerRadius;

      // Typography
      if (node.type === 'TEXT') {
        result.characters = node.characters;
        if ('fontSize' in node) result.fontSize = node.fontSize;
        if ('fontName' in node) {
          try { result.fontName = JSON.parse(JSON.stringify(node.fontName)); } catch(e) {}
        }
        if ('textAlignHorizontal' in node) result.textAlignHorizontal = node.textAlignHorizontal;
        if ('textAlignVertical' in node) result.textAlignVertical = node.textAlignVertical;
        if ('lineHeight' in node) {
          try { result.lineHeight = JSON.parse(JSON.stringify(node.lineHeight)); } catch(e) {}
        }
        if ('letterSpacing' in node) {
          try { result.letterSpacing = JSON.parse(JSON.stringify(node.letterSpacing)); } catch(e) {}
        }
      }

      // Component info
      if ('componentProperties' in node) {
        try { result.componentProperties = JSON.parse(JSON.stringify(node.componentProperties)); } catch(e) {}
      }
      if (node.type === 'INSTANCE' && node.mainComponent) {
        result.mainComponentId = node.mainComponent.id;
        result.mainComponentName = node.mainComponent.name;
      }
      if (node.type === 'COMPONENT') {
        result.isComponent = true;
      }

      // Children
      if ('children' in node && currentDepth < maxDepth) {
        result.children = node.children.map(c => serializeNode(c, currentDepth + 1, maxDepth)).filter(Boolean);
      }

      return result;
    }

    let targetNodes;
    ${
      nodeId
        ? `
      const target = figma.getNodeById("${nodeId}");
      if (!target) return JSON.stringify({ error: "Node not found: ${nodeId}" });
      targetNodes = [target];
    `
        : `
      targetNodes = figma.currentPage.selection;
      if (!targetNodes || targetNodes.length === 0) {
        return JSON.stringify({ error: "No nodes selected. Select a node in Figma or provide a nodeId." });
      }
    `
    }

    const result = {
      fileName: figma.root.name,
      currentPage: figma.currentPage.name,
      selectionCount: targetNodes.length,
      nodes: targetNodes.map(n => serializeNode(n, 0, ${depth})),
    };

    return JSON.stringify(result);
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e) });
  }
})()
`;

export const FILE_INFO_SCRIPT = `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: "Figma Plugin API not available — ensure a file is open and fully loaded" };

    const pages = figma.root.children;
    const currentPage = figma.currentPage;
    const selection = currentPage.selection;

    let componentCount = 0;
    let instanceCount = 0;
    let textCount = 0;
    let frameCount = 0;

    function countNodes(node) {
      if (node.type === 'COMPONENT') componentCount++;
      if (node.type === 'INSTANCE') instanceCount++;
      if (node.type === 'TEXT') textCount++;
      if (node.type === 'FRAME') frameCount++;
      if ('children' in node) node.children.forEach(countNodes);
    }
    currentPage.children.forEach(countNodes);

    return {
      fileName: figma.root.name,
      currentPage: currentPage.name,
      pageCount: pages.length,
      pageNames: pages.map(p => p.name),
      selectionCount: selection.length,
      selectedNodeIds: selection.map(n => n.id),
      selectedNodeNames: selection.map(n => n.name),
      currentPageStats: {
        components: componentCount,
        instances: instanceCount,
        textNodes: textCount,
        frames: frameCount,
      },
    };
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

export const METADATA_XML_SCRIPT = (nodeId: string | null, depth: number) => `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return JSON.stringify({ error: "Figma Plugin API not available — ensure a file is open and fully loaded" });

    function esc(s) {
      return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function nodeToXml(node, indent, currentDepth) {
      if (!node || currentDepth > ${depth}) return '';
      try {
        const pad = '  '.repeat(indent);
        const tag = (node.type || 'node').toLowerCase().replace(/_/g, '-');
        const attrs = [];
        try { attrs.push('id="' + esc(node.id) + '"'); } catch(_) {}
        try { attrs.push('name="' + esc(node.name) + '"'); } catch(_) {}
        try { if ('x' in node) attrs.push('x="' + Math.round(node.x) + '"'); } catch(_) {}
        try { if ('y' in node) attrs.push('y="' + Math.round(node.y) + '"'); } catch(_) {}
        try { if ('width' in node) attrs.push('width="' + Math.round(node.width) + '"'); } catch(_) {}
        try { if ('height' in node) attrs.push('height="' + Math.round(node.height) + '"'); } catch(_) {}
        try {
          if (node.type === 'TEXT' && 'characters' in node) {
            attrs.push('text="' + esc(String(node.characters).substring(0, 80)) + '"');
          }
        } catch(_) {}

        if ('children' in node && node.children && node.children.length > 0 && currentDepth < ${depth}) {
          let xml = pad + '<' + tag + ' ' + attrs.join(' ') + '>\\n';
          for (let i = 0; i < node.children.length; i++) {
            try { xml += nodeToXml(node.children[i], indent + 1, currentDepth + 1); } catch(_) {}
          }
          xml += pad + '</' + tag + '>\\n';
          return xml;
        } else {
          return pad + '<' + tag + ' ' + attrs.join(' ') + '/>\\n';
        }
      } catch(e) { return ''; }
    }

    let targetNodes;
    ${
      nodeId
        ? `
      const target = figma.getNodeById("${nodeId}");
      if (!target) return JSON.stringify({ error: "Node not found: ${nodeId}" });
      targetNodes = [target];
    `
        : `
      const sel = figma.currentPage.selection;
      targetNodes = (sel && sel.length > 0) ? sel : figma.currentPage.children;
    `
    }

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\\n';
    xml += '<canvas name="' + esc(figma.currentPage.name) + '" file="' + esc(figma.root.name) + '">\\n';
    for (let i = 0; i < targetNodes.length; i++) {
      try { xml += nodeToXml(targetNodes[i], 1, 0); } catch(_) {}
    }
    xml += '</canvas>\\n';

    return JSON.stringify({ xml });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e) });
  }
})()
`;

export const VARIABLE_DEFS_SCRIPT = (nodeId: string | null) => `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: "Figma Plugin API not available — ensure a file is open and fully loaded" };

    let targetNodes = null;
    let fileWideMode = false;
    ${
      nodeId
        ? `
      const target = figma.getNodeById("${nodeId}");
      if (!target) return { error: "Node not found: ${nodeId}" };
      targetNodes = [target];
    `
        : `
      const sel = figma.currentPage.selection;
      if (sel && sel.length > 0) {
        targetNodes = sel;
      } else {
        fileWideMode = true;
      }
    `
    }

    const variables = {};
    const styles = {};

    if (fileWideMode) {
      // Collect ALL local variable collections from the file
      try {
        const collections = figma.variables.getLocalVariableCollections();
        for (const coll of collections) {
          for (const varId of coll.variableIds) {
            try {
              const v = figma.variables.getVariableById(varId);
              if (v && !variables[v.id]) {
                const values = {};
                for (const mode of coll.modes) {
                  try { values[mode.name] = JSON.parse(JSON.stringify(v.valuesByMode[mode.modeId])); } catch(e) {}
                }
                variables[v.id] = {
                  name: v.name,
                  type: v.resolvedType,
                  collection: coll.name,
                  valuesByMode: values,
                };
              }
            } catch(e) {}
          }
        }
      } catch(e) {}

      // Collect ALL local styles from the file
      const styleFns = [
        ['PAINT', 'getLocalPaintStyles'],
        ['TEXT', 'getLocalTextStyles'],
        ['EFFECT', 'getLocalEffectStyles'],
        ['GRID', 'getLocalGridStyles'],
      ];
      for (const [type, fn] of styleFns) {
        try {
          const localStyles = figma[fn]();
          for (const s of localStyles) {
            if (!styles[s.id]) {
              styles[s.id] = {
                name: s.name,
                type: type,
                description: s.description || null,
              };
            }
          }
        } catch(e) {}
      }

      return {
        variables: Object.values(variables),
        styles: Object.values(styles),
        source: 'file',
      };
    }

    // Selection-based collection
    function collectVariables(node) {
      if ('boundVariables' in node && node.boundVariables) {
        for (const [prop, binding] of Object.entries(node.boundVariables)) {
          try {
            const bindings = Array.isArray(binding) ? binding : [binding];
            for (const b of bindings) {
              if (b && b.id) {
                const v = figma.variables.getVariableById(b.id);
                if (v && !variables[v.id]) {
                  const collection = figma.variables.getVariableCollectionById(v.variableCollectionId);
                  variables[v.id] = {
                    name: v.name,
                    type: v.resolvedType,
                    collection: collection ? collection.name : null,
                    valuesByMode: {},
                  };
                  if (collection) {
                    for (const mode of collection.modes) {
                      try {
                        const val = v.valuesByMode[mode.modeId];
                        variables[v.id].valuesByMode[mode.name] = JSON.parse(JSON.stringify(val));
                      } catch(e) {}
                    }
                  }
                }
              }
            }
          } catch(e) {}
        }
      }

      const styleProps = ['fillStyleId', 'strokeStyleId', 'textStyleId', 'effectStyleId', 'gridStyleId'];
      for (const prop of styleProps) {
        if (prop in node && node[prop] && typeof node[prop] === 'string') {
          try {
            const style = figma.getStyleById(node[prop]);
            if (style && !styles[style.id]) {
              styles[style.id] = {
                name: style.name,
                type: style.type,
                description: style.description || null,
              };
            }
          } catch(e) {}
        }
      }

      if ('children' in node) {
        node.children.forEach(collectVariables);
      }
    }

    targetNodes.forEach(collectVariables);

    return {
      variables: Object.values(variables),
      styles: Object.values(styles),
      source: 'selection',
      nodeCount: targetNodes.length,
    };
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

export const FIGJAM_SCRIPT = (nodeId: string | null) => `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: "Figma Plugin API not available" };

    function nodeToXml(node, indent) {
      try {
        if (!node) return '';
        const pad = '  '.repeat(indent);
        const attrs = [];
        try { attrs.push('id="' + node.id + '"'); } catch(_) {}
        try { attrs.push('name="' + (node.name || '').replace(/"/g, '&quot;') + '"'); } catch(_) {}
        try { attrs.push('type="' + node.type + '"'); } catch(_) {}
        try { if ('x' in node) attrs.push('x="' + Math.round(node.x) + '"'); } catch(_) {}
        try { if ('y' in node) attrs.push('y="' + Math.round(node.y) + '"'); } catch(_) {}
        try { if ('width' in node) attrs.push('width="' + Math.round(node.width) + '"'); } catch(_) {}
        try { if ('height' in node) attrs.push('height="' + Math.round(node.height) + '"'); } catch(_) {}
        try {
          if (node.type === 'STICKY' || node.type === 'SHAPE_WITH_TEXT') {
            var text = ('characters' in node) ? node.characters : (node.text ? node.text.characters : null);
            if (text) attrs.push('text="' + String(text).replace(/"/g, '&quot;') + '"');
          }
        } catch(_) {}
        try {
          if (node.type === 'CONNECTOR') {
            try { if (node.connectorStart && node.connectorStart.endpointNodeId) attrs.push('startNodeId="' + node.connectorStart.endpointNodeId + '"'); } catch(_) {}
            try { if (node.connectorEnd && node.connectorEnd.endpointNodeId) attrs.push('endNodeId="' + node.connectorEnd.endpointNodeId + '"'); } catch(_) {}
            try { if (node.text && node.text.characters) attrs.push('label="' + node.text.characters.replace(/"/g, '&quot;') + '"'); } catch(_) {}
          }
        } catch(_) {}
        var nodeType = node.type || 'NODE';
        if ('children' in node && node.children && node.children.length > 0) {
          var xml = pad + '<' + nodeType + ' ' + attrs.join(' ') + '>\\n';
          for (var ci = 0; ci < node.children.length; ci++) {
            try { xml += nodeToXml(node.children[ci], indent + 1); } catch(_) {}
          }
          xml += pad + '</' + nodeType + '>\\n';
          return xml;
        } else {
          return pad + '<' + nodeType + ' ' + attrs.join(' ') + '/>\\n';
        }
      } catch(e) {
        return '';
      }
    }

    var targetNodes;
    ${
      nodeId
        ? `
      var target = figma.getNodeById("${nodeId}");
      if (!target) return { error: "Node not found: ${nodeId}" };
      targetNodes = [target];
    `
        : `
      var sel = figma.currentPage.selection;
      targetNodes = (sel && sel.length > 0) ? sel : figma.currentPage.children;
    `
    }

    var xml = '<?xml version="1.0" encoding="UTF-8"?>\\n<figjam fileName="' + figma.root.name + '" page="' + figma.currentPage.name + '">\\n';
    for (var i = 0; i < targetNodes.length; i++) {
      xml += nodeToXml(targetNodes[i], 1);
    }
    xml += '</figjam>\\n';

    var nodeIds = [];
    function collectIds(n) {
      if (n.type !== 'DOCUMENT' && n.type !== 'CANVAS') nodeIds.push(n.id);
      if ('children' in n && nodeIds.length < 20) { for (var k = 0; k < n.children.length; k++) { try { collectIds(n.children[k]); } catch(_) {} } }
    }
    for (var j = 0; j < targetNodes.length; j++) { try { collectIds(targetNodes[j]); } catch(_) {} }

    return { xml: xml, nodeIds: nodeIds.slice(0, 20), nodeCount: targetNodes.length };
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

export const GENERATE_DIAGRAM_SCRIPT = (nodesJson: string) => `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: "Figma Plugin API not available" };
    if (typeof figma.createShapeWithText !== 'function') {
      return { error: "This command requires a FigJam file. Open or create a FigJam file first." };
    }
    const nodes = ${nodesJson};
    const createdNodes = {};
    const SPACING_X = 250;
    const SPACING_Y = 120;
    const cols = Math.ceil(Math.sqrt(nodes.length));
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const shape = figma.createShapeWithText();
      shape.shapeType = n.shape || 'ROUNDED_RECTANGLE';
      shape.x = (i % cols) * SPACING_X + 100;
      shape.y = Math.floor(i / cols) * SPACING_Y + 100;
      shape.resize(200, 60);
      try {
        if (shape.text) {
          figma.loadFontAsync(shape.text.fontName || { family: 'Inter', style: 'Medium' }).then(() => {
            shape.text.characters = n.label || n.id;
          }).catch(() => {});
        }
      } catch(_) {}
      createdNodes[n.id] = shape.id;
      figma.currentPage.appendChild(shape);
    }
    const edgeList = nodes.filter(n => n._edges).flatMap(n => n._edges);
    const connectors = [];
    for (const edge of edgeList) {
      if (createdNodes[edge.from] && createdNodes[edge.to]) {
        try {
          const connector = figma.createConnector();
          connector.connectorStart = { endpointNodeId: createdNodes[edge.from], magnet: 'AUTO' };
          connector.connectorEnd = { endpointNodeId: createdNodes[edge.to], magnet: 'AUTO' };
          if (edge.label && connector.text) {
            figma.loadFontAsync(connector.text.fontName || { family: 'Inter', style: 'Medium' }).then(() => {
              connector.text.characters = edge.label;
            }).catch(() => {});
          }
          connectors.push(connector.id);
        } catch(e) {}
      }
    }
    const allCreated = Object.values(createdNodes).map(id => figma.getNodeById(id)).filter(Boolean);
    if (allCreated.length > 0) {
      figma.currentPage.selection = allCreated;
      figma.viewport.scrollAndZoomIntoView(allCreated);
    }
    return { success: true, nodesCreated: Object.keys(createdNodes).length, connectorsCreated: connectors.length };
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

export const DESIGN_SYSTEM_RULES_SCRIPT = `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: "Figma Plugin API not available" };

    // Collect all local variable collections and their variables
    const collections = [];
    try {
      const localCollections = figma.variables.getLocalVariableCollections();
      for (const coll of localCollections) {
        const vars = [];
        for (const varId of coll.variableIds) {
          const v = figma.variables.getVariableById(varId);
          if (v) {
            const values = {};
            for (const mode of coll.modes) {
              try { values[mode.name] = JSON.parse(JSON.stringify(v.valuesByMode[mode.modeId])); } catch(e) {}
            }
            vars.push({ name: v.name, type: v.resolvedType, values });
          }
        }
        collections.push({ name: coll.name, modes: coll.modes.map(m => m.name), variables: vars });
      }
    } catch(e) {}

    // Collect local styles with full values
    const allStyles = [];
    try {
      const paintStyles = figma.getLocalPaintStyles ? figma.getLocalPaintStyles() : [];
      for (const s of paintStyles) {
        const entry = { name: s.name, type: 'PAINT', description: s.description || null };
        try { entry.paints = JSON.parse(JSON.stringify(s.paints)); } catch(e) {}
        allStyles.push(entry);
      }
    } catch(e) {}
    try {
      const textStyles = figma.getLocalTextStyles ? figma.getLocalTextStyles() : [];
      for (const s of textStyles) {
        const entry = { name: s.name, type: 'TEXT', description: s.description || null };
        try { entry.fontSize = s.fontSize; } catch(e) {}
        try { entry.fontName = JSON.parse(JSON.stringify(s.fontName)); } catch(e) {}
        try { entry.lineHeight = JSON.parse(JSON.stringify(s.lineHeight)); } catch(e) {}
        try { entry.letterSpacing = JSON.parse(JSON.stringify(s.letterSpacing)); } catch(e) {}
        try { entry.textDecoration = s.textDecoration; } catch(e) {}
        try { entry.textCase = s.textCase; } catch(e) {}
        allStyles.push(entry);
      }
    } catch(e) {}
    try {
      const effectStyles = figma.getLocalEffectStyles ? figma.getLocalEffectStyles() : [];
      for (const s of effectStyles) {
        const entry = { name: s.name, type: 'EFFECT', description: s.description || null };
        try { entry.effects = JSON.parse(JSON.stringify(s.effects)); } catch(e) {}
        allStyles.push(entry);
      }
    } catch(e) {}
    try {
      const gridStyles = figma.getLocalGridStyles ? figma.getLocalGridStyles() : [];
      for (const s of gridStyles) {
        const entry = { name: s.name, type: 'GRID', description: s.description || null };
        try { entry.layoutGrids = JSON.parse(JSON.stringify(s.layoutGrids)); } catch(e) {}
        allStyles.push(entry);
      }
    } catch(e) {}

    // Collect component sets (variants)
    const components = [];
    function findComponents(node) {
      if (node.type === 'COMPONENT_SET') {
        const props = {};
        try { Object.assign(props, JSON.parse(JSON.stringify(node.componentPropertyDefinitions))); } catch(e) {}
        components.push({ name: node.name, type: 'COMPONENT_SET', properties: props });
      } else if (node.type === 'COMPONENT' && (!node.parent || node.parent.type !== 'COMPONENT_SET')) {
        components.push({ name: node.name, type: 'COMPONENT' });
      }
      if ('children' in node) node.children.forEach(findComponents);
    }
    figma.currentPage.children.forEach(findComponents);

    return {
      fileName: figma.root.name,
      collections,
      styles: allStyles,
      components: components.slice(0, 100), // limit
    };
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

export const SCREENSHOT_SCRIPT = (nodeId: string | null, scale: number) => `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: "Figma Plugin API not available — ensure a file is open and fully loaded" };

    let target;
    ${
      nodeId
        ? `
      target = figma.getNodeById("${nodeId}");
      if (!target) return { error: "Node not found: ${nodeId}" };
    `
        : `
      const sel = figma.currentPage.selection;
      if (!sel || sel.length === 0) return { error: "No node selected" };
      target = sel[0];
    `
    }

    // exportAsync returns a Uint8Array in Plugin API
    return target.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: ${scale} }
    }).then(bytes => {
      // Convert to base64 for transport over IPC
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return { base64: btoa(binary), nodeId: target.id, nodeName: target.name };
    });
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

export const SEARCH_DESIGN_SYSTEM_SCRIPT = (query: string) => `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: "Figma Plugin API not available" };
    const q = "${query}".toLowerCase();
    const results = { variables: [], styles: [], components: [] };

    // Search local variables
    try {
      const collections = figma.variables.getLocalVariableCollections();
      for (const coll of collections) {
        for (const varId of coll.variableIds) {
          try {
            const v = figma.variables.getVariableById(varId);
            if (v && v.name.toLowerCase().includes(q)) {
              const values = {};
              for (const mode of coll.modes) {
                try { values[mode.name] = JSON.parse(JSON.stringify(v.valuesByMode[mode.modeId])); } catch(e) {}
              }
              results.variables.push({ name: v.name, type: v.resolvedType, collection: coll.name, valuesByMode: values });
            }
          } catch(e) {}
        }
      }
    } catch(e) {}

    // Search local styles
    const styleFns = [
      ['PAINT', 'getLocalPaintStyles'],
      ['TEXT', 'getLocalTextStyles'],
      ['EFFECT', 'getLocalEffectStyles'],
      ['GRID', 'getLocalGridStyles'],
    ];
    for (const [type, fn] of styleFns) {
      try {
        const localStyles = figma[fn]();
        for (const s of localStyles) {
          if (s.name.toLowerCase().includes(q)) {
            results.styles.push({ name: s.name, type: type, description: s.description || null });
          }
        }
      } catch(e) {}
    }

    // Search components on current page
    function findComponents(node) {
      if (node.type === 'COMPONENT_SET' && node.name.toLowerCase().includes(q)) {
        results.components.push({ name: node.name, id: node.id, type: 'COMPONENT_SET' });
      } else if (node.type === 'COMPONENT' && (!node.parent || node.parent.type !== 'COMPONENT_SET') && node.name.toLowerCase().includes(q)) {
        results.components.push({ name: node.name, id: node.id, type: 'COMPONENT' });
      }
      if ('children' in node && results.components.length < 50) node.children.forEach(findComponents);
    }
    figma.currentPage.children.forEach(findComponents);

    results.variables = results.variables.slice(0, 50);
    results.styles = results.styles.slice(0, 50);
    results.components = results.components.slice(0, 50);

    return results;
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

export const USE_FIGMA_SCRIPT = (action: string, params: string) => `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: "Figma Plugin API not available" };
    const params = ${params};
    const action = "${action}";

    switch (action) {
      case 'create_frame': {
        const frame = figma.createFrame();
        frame.name = params.name || 'New Frame';
        if (params.x !== undefined) frame.x = params.x;
        if (params.y !== undefined) frame.y = params.y;
        if (params.cornerRadius !== undefined) frame.cornerRadius = params.cornerRadius;
        // Resize BEFORE setting sizing modes — frame.resize() in Figma resets both sizing modes
        // to FIXED, so it must run first; AUTO/FIXED assignments below then override correctly.
        if (params.width && params.height) frame.resize(params.width, params.height);
        // Auto-layout (sizing mode assignments come AFTER resize so they are not clobbered)
        if (params.layoutMode) { try { frame.layoutMode = params.layoutMode; } catch(e) {} }
        if (params.layoutMode && params.layoutMode !== 'NONE') {
          if (params.paddingTop !== undefined) frame.paddingTop = params.paddingTop;
          if (params.paddingBottom !== undefined) frame.paddingBottom = params.paddingBottom;
          if (params.paddingLeft !== undefined) frame.paddingLeft = params.paddingLeft;
          if (params.paddingRight !== undefined) frame.paddingRight = params.paddingRight;
          if (params.itemSpacing !== undefined) frame.itemSpacing = params.itemSpacing;
          if (params.primaryAxisAlignItems) { try { frame.primaryAxisAlignItems = params.primaryAxisAlignItems; } catch(e) {} }
          if (params.counterAxisAlignItems) { try { frame.counterAxisAlignItems = params.counterAxisAlignItems; } catch(e) {} }
          if (params.primaryAxisSizingMode) { try { frame.primaryAxisSizingMode = params.primaryAxisSizingMode; } catch(e) {} }
          if (params.counterAxisSizingMode) { try { frame.counterAxisSizingMode = params.counterAxisSizingMode; } catch(e) {} }
        }
        if (params.parentNodeId) {
          const parent = figma.getNodeById(params.parentNodeId);
          if (parent && 'appendChild' in parent) parent.appendChild(frame);
        }
        // Apply fills/strokes after reparenting — appendChild resets fills to frame default
        if (params.fills) { try { frame.fills = params.fills; } catch(e) {} }
        if (params.strokes) { try { frame.strokes = params.strokes; } catch(e) {} }
        if (params.strokeWeight !== undefined) frame.strokeWeight = params.strokeWeight;
        if (params.strokeAlign) { try { frame.strokeAlign = params.strokeAlign; } catch(e) {} }
        figma.currentPage.selection = [frame];
        figma.viewport.scrollAndZoomIntoView([frame]);
        return { success: true, nodeId: frame.id, name: frame.name, type: 'FRAME' };
      }
      case 'create_text': {
        const text = figma.createText();
        text.name = params.name || 'New Text';
        if (params.x !== undefined) text.x = params.x;
        if (params.y !== undefined) text.y = params.y;
        const family = params.fontFamily || 'Inter';
        const style = params.fontStyle || 'Regular';
        // Always load Regular first — new text nodes start with the default Regular font.
        // Without this, setting characters on a Bold node throws "Inter Regular unloaded".
        const fontLoads = [figma.loadFontAsync({ family, style: 'Regular' })];
        if (style !== 'Regular') fontLoads.push(figma.loadFontAsync({ family, style }));
        return Promise.all(fontLoads).then(() => {
          text.characters = params.characters || 'Text';
          if (params.fontSize) text.fontSize = params.fontSize;
          if (style !== 'Regular') { try { text.fontName = { family, style }; } catch(e) {} }
          if (params.parentNodeId) {
            const parent = figma.getNodeById(params.parentNodeId);
            if (parent && 'appendChild' in parent) parent.appendChild(text);
          }
          // Apply fills after reparenting — appendChild resets fills
          if (params.fills) { try { text.fills = params.fills; } catch(e) {} }
          figma.currentPage.selection = [text];
          return { success: true, nodeId: text.id, name: text.name, type: 'TEXT' };
        });
      }
      case 'create_rectangle': {
        const rect = figma.createRectangle();
        rect.name = params.name || 'New Rectangle';
        rect.resize(params.width || 100, params.height || 100);
        if (params.x !== undefined) rect.x = params.x;
        if (params.y !== undefined) rect.y = params.y;
        if (params.cornerRadius !== undefined) rect.cornerRadius = params.cornerRadius;
        if (params.parentNodeId) {
          const parent = figma.getNodeById(params.parentNodeId);
          if (parent && 'appendChild' in parent) parent.appendChild(rect);
        }
        // Apply fills/strokes after reparenting — appendChild resets fills to frame default
        if (params.fills) { try { rect.fills = params.fills; } catch(e) {} }
        if (params.strokes) { try { rect.strokes = params.strokes; } catch(e) {} }
        if (params.strokeWeight !== undefined) rect.strokeWeight = params.strokeWeight;
        if (params.strokeAlign) { try { rect.strokeAlign = params.strokeAlign; } catch(e) {} }
        figma.currentPage.selection = [rect];
        return { success: true, nodeId: rect.id, name: rect.name, type: 'RECTANGLE' };
      }
      case 'reparent_node': {
        if (!params.nodeId) return { error: 'nodeId is required' };
        if (!params.parentNodeId) return { error: 'parentNodeId is required' };
        const node = figma.getNodeById(params.nodeId);
        if (!node) return { error: 'Node not found: ' + params.nodeId };
        const parent = figma.getNodeById(params.parentNodeId);
        if (!parent) return { error: 'Parent not found: ' + params.parentNodeId };
        if (!('appendChild' in parent)) return { error: 'Parent cannot have children' };
        parent.appendChild(node);
        return { success: true, nodeId: node.id, name: node.name, parentId: parent.id };
      }
      case 'update_node': {
        if (!params.nodeId) return { error: 'nodeId is required' };
        const node = figma.getNodeById(params.nodeId);
        if (!node) return { error: 'Node not found: ' + params.nodeId };
        if (params.name !== undefined) node.name = params.name;
        if (params.visible !== undefined) node.visible = params.visible;
        if (params.opacity !== undefined && 'opacity' in node) node.opacity = params.opacity;
        if (params.x !== undefined && 'x' in node) node.x = params.x;
        if (params.y !== undefined && 'y' in node) node.y = params.y;
        if (params.width !== undefined && params.height !== undefined && 'resize' in node) node.resize(params.width, params.height);
        if (params.fills && 'fills' in node) { try { node.fills = params.fills; } catch(e) {} }
        if (params.strokes && 'strokes' in node) { try { node.strokes = params.strokes; } catch(e) {} }
        if (params.strokeWeight !== undefined && 'strokeWeight' in node) node.strokeWeight = params.strokeWeight;
        if (params.strokeAlign && 'strokeAlign' in node) { try { node.strokeAlign = params.strokeAlign; } catch(e) {} }
        if (params.cornerRadius !== undefined && 'cornerRadius' in node) node.cornerRadius = params.cornerRadius;
        // Auto-layout (frames only)
        if (node.type === 'FRAME') {
          if (params.layoutMode) { try { node.layoutMode = params.layoutMode; } catch(e) {} }
          if (params.paddingTop !== undefined) node.paddingTop = params.paddingTop;
          if (params.paddingBottom !== undefined) node.paddingBottom = params.paddingBottom;
          if (params.paddingLeft !== undefined) node.paddingLeft = params.paddingLeft;
          if (params.paddingRight !== undefined) node.paddingRight = params.paddingRight;
          if (params.itemSpacing !== undefined) node.itemSpacing = params.itemSpacing;
          if (params.primaryAxisAlignItems) { try { node.primaryAxisAlignItems = params.primaryAxisAlignItems; } catch(e) {} }
          if (params.counterAxisAlignItems) { try { node.counterAxisAlignItems = params.counterAxisAlignItems; } catch(e) {} }
          if (params.primaryAxisSizingMode) { try { node.primaryAxisSizingMode = params.primaryAxisSizingMode; } catch(e) {} }
          if (params.counterAxisSizingMode) { try { node.counterAxisSizingMode = params.counterAxisSizingMode; } catch(e) {} }
        }
        if (params.characters !== undefined && node.type === 'TEXT') {
          return figma.loadFontAsync(node.fontName || { family: 'Inter', style: 'Regular' }).then(() => {
            node.characters = params.characters;
            return { success: true, nodeId: node.id, name: node.name };
          });
        }
        return { success: true, nodeId: node.id, name: node.name };
      }
      case 'delete_node': {
        if (!params.nodeId) return { error: 'nodeId is required' };
        const node = figma.getNodeById(params.nodeId);
        if (!node) return { error: 'Node not found: ' + params.nodeId };
        const name = node.name;
        node.remove();
        return { success: true, deleted: params.nodeId, name: name };
      }
      case 'set_variable': {
        if (!params.name || !params.collectionName) return { error: 'name and collectionName are required' };
        let collection = null;
        try {
          const colls = figma.variables.getLocalVariableCollections();
          collection = colls.find(c => c.name === params.collectionName);
        } catch(e) {}
        if (!collection) {
          collection = figma.variables.createVariableCollection(params.collectionName);
        }
        const resolvedType = params.resolvedType || 'COLOR';
        const variable = figma.variables.createVariable(params.name, collection, resolvedType);
        if (params.value !== undefined) {
          const modeId = collection.modes[0].modeId;
          variable.setValueForMode(modeId, params.value);
        }
        return { success: true, variableId: variable.id, name: variable.name, collection: collection.name };
      }
      default:
        return { error: 'Unknown action: ' + action };
    }
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;

export const CREATE_PAGE_SCRIPT = (pageName: string) => `
(function() {
  try {
    const figma = window.figma;
    if (!figma) return { error: "Figma Plugin API not available" };
    const page = figma.createPage();
    page.name = "${pageName}";
    figma.currentPage = page;
    return { success: true, pageId: page.id, pageName: page.name };
  } catch (e) {
    return { error: e.message || String(e) };
  }
})()
`;
