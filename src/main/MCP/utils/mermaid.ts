/**
 * mermaid.ts -- Minimal Mermaid flowchart parser.
 *
 * Parses a subset of Mermaid graph syntax (nodes, shapes, edges) used by
 * the generate_diagram tool. Extracted verbatim from McpServer.ts
 * (Phase 4 of decomposition); no behavior change.
 */

export function parseMermaid(src: string): {
  nodes: { id: string; label: string; shape: string }[];
  edges: { from: string; to: string; label: string }[];
} {
  const nodes = new Map<string, { id: string; label: string; shape: string }>();
  const edges: { from: string; to: string; label: string }[] = [];
  // Pre-process: split on newlines + semicolons, strip directives, expand chains (A-->B-->C → A-->B, B-->C)
  const NODE_PAT = "[\\w]+(?:\\[[^\\]]+\\]|\\([^)]+\\)|\\{[^}]+\\})?";
  const ARROW_PAT = "(?:-->|==>|-\\.->|---)";
  const EL_PAT = "(?:\\|[^|]*\\|)?";
  const firstNodeRe = new RegExp(`^(${NODE_PAT})`);
  const contRe = new RegExp(`^\\s*(${ARROW_PAT})\\s*(${EL_PAT})\\s*(${NODE_PAT})`);
  const directiveRe =
    /^(?:graph|flowchart|stateDiagram|sequenceDiagram|gantt|title|section|dateFormat|axisFormat)\s*(?:TD|LR|TB|RL|BT)?\s*;?\s*(.*)/i;

  const lines: string[] = [];
  for (const raw of src
    .split(/[\n;]/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("%%"))) {
    const dm = raw.match(directiveRe);
    const stmt = dm ? dm[1].trim() : raw;
    if (!stmt) continue;

    // Expand chains: A-->B-->C → ["A-->B", "B-->C"]
    const firstNode = stmt.match(firstNodeRe);
    if (firstNode) {
      let prevNode = firstNode[1];
      let rest = stmt.slice(firstNode[0].length);
      const segs: string[] = [];
      while (rest.length > 0) {
        const cont = rest.match(contRe);
        if (!cont) break;
        segs.push(`${prevNode}${cont[1]}${cont[2]}${cont[3]}`);
        prevNode = cont[3];
        rest = rest.slice(cont[0].length);
      }
      lines.push(...(segs.length > 0 ? segs : [stmt]));
    } else {
      lines.push(stmt);
    }
  }

  for (const line of lines) {
    // Flowchart edges: A[Label] --> B[Label], A -->|label| B
    const em = line.match(
      /^\s*([\w]+)(?:\[([^\]]+)\]|\(([^)]+)\)|\{([^}]+)\})?\s*(?:-->|==>|-.->|---)\s*(?:\|([^|]*)\|)?\s*([\w]+)(?:\[([^\]]+)\]|\(([^)]+)\)|\{([^}]+)\})?/,
    );
    if (em) {
      const fId = em[1],
        fL = em[2] || em[3] || em[4] || em[1],
        eL = em[5] || "",
        tId = em[6],
        tL = em[7] || em[8] || em[9] || em[6];
      const fS = em[4] ? "DIAMOND" : em[3] ? "ELLIPSE" : "ROUNDED_RECTANGLE";
      const tS = em[9] ? "DIAMOND" : em[8] ? "ELLIPSE" : "ROUNDED_RECTANGLE";
      if (!nodes.has(fId)) nodes.set(fId, { id: fId, label: fL, shape: fS });
      if (!nodes.has(tId)) nodes.set(tId, { id: tId, label: tL, shape: tS });
      edges.push({ from: fId, to: tId, label: eL.trim() });
      continue;
    }

    // Standalone node: A["Label"]
    const nm = line.match(/^\s*([\w]+)(?:\[([^\]]+)\]|\(([^)]+)\)|\{([^}]+)\})\s*$/);
    if (nm) {
      const id = nm[1],
        label = nm[2] || nm[3] || nm[4] || id;
      const shape = nm[4] ? "DIAMOND" : nm[3] ? "ELLIPSE" : "ROUNDED_RECTANGLE";
      if (!nodes.has(id)) nodes.set(id, { id, label, shape });
      continue;
    }

    // Sequence diagram: Actor ->> Actor: message
    const sm = line.match(/^\s*([\w\s]+?)\s*(?:->>|-->>|->|-->)\s*([\w\s]+?)\s*:\s*(.+)$/);
    if (sm) {
      const fId = sm[1].trim().replace(/\s+/g, "_"),
        tId = sm[2].trim().replace(/\s+/g, "_");
      if (!nodes.has(fId))
        nodes.set(fId, { id: fId, label: sm[1].trim(), shape: "ROUNDED_RECTANGLE" });
      if (!nodes.has(tId))
        nodes.set(tId, { id: tId, label: sm[2].trim(), shape: "ROUNDED_RECTANGLE" });
      edges.push({ from: fId, to: tId, label: sm[3].trim() });
      continue;
    }

    // State diagram: StateA --> StateB : event
    const stm = line.match(/^\s*([\w]+)\s*-->\s*([\w]+)\s*(?::\s*(.+))?$/);
    if (stm) {
      if (!nodes.has(stm[1]))
        nodes.set(stm[1], { id: stm[1], label: stm[1], shape: "ROUNDED_RECTANGLE" });
      if (!nodes.has(stm[2]))
        nodes.set(stm[2], { id: stm[2], label: stm[2], shape: "ROUNDED_RECTANGLE" });
      edges.push({ from: stm[1], to: stm[2], label: (stm[3] || "").trim() });
    }
  }
  return { nodes: [...nodes.values()], edges };
}
