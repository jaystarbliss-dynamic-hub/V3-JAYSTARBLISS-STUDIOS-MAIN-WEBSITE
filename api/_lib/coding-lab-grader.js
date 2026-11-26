/**
 * Structural Scratch 3 project.json grading engine shared by client preview,
 * Netlify Functions, and automated unit tests.
 *
 * Evaluates actual Scratch 3 block graph relationships (opcodes, inputs, fields,
 * parent/next chains, nested substacks, variables, lists, sprites, costumes)
 * independent of block visual workspace coordinates.
 */

export const CODING_LAB_CRITERION_TYPES = [
  "EVENT_BLOCK_USED",
  "BLOCK_PRESENT",
  "BLOCK_INPUT_VALUE",
  "BLOCK_FIELD_VALUE",
  "BLOCK_SEQUENCE",
  "BLOCK_NESTED",
  "VARIABLE_OR_LIST_USED",
  "SPRITE_COUNT",
  "COSTUME_OR_BACKDROP_CHECK",
];

/**
 * Extracts a comparable scalar value from a Scratch 3 block input tuple.
 * Scratch 3 encodes inputs as:
 * - [1, [4, "50"]] (unobscured shadow primitive: number/string/angle/color/broadcast)
 * - [2, "blockId"] (block reference without shadow)
 * - [3, "blockId", [4, "10"]] (obscured shadow + reporter block)
 * - [1, [12, "score", "varId"]] (variable reporter)
 */
export function extractScratchInputValue(inputEntry, blocksMap = {}) {
  if (!Array.isArray(inputEntry) || inputEntry.length < 2) return null;
  const primary = inputEntry[1];

  // Direct literal primitive tuple e.g. [4, "50"] or [10, "Hello!"]
  if (Array.isArray(primary) && primary.length >= 2) {
    return String(primary[1] ?? "").trim();
  }

  // Reference to another block (e.g. shadow menu block or reporter)
  if (typeof primary === "string" && blocksMap[primary]) {
    const refBlock = blocksMap[primary];
    if (refBlock && refBlock.fields && typeof refBlock.fields === "object") {
      const firstFieldKey = Object.keys(refBlock.fields)[0];
      if (firstFieldKey && Array.isArray(refBlock.fields[firstFieldKey])) {
        return String(refBlock.fields[firstFieldKey][0] ?? "").trim();
      }
    }
    if (refBlock && refBlock.opcode) {
      return `block:${refBlock.opcode}`;
    }
  }

  // Fallback to shadowed primitive if present at index 2
  if (inputEntry.length >= 3 && Array.isArray(inputEntry[2]) && inputEntry[2].length >= 2) {
    return String(inputEntry[2][1] ?? "").trim();
  }

  return null;
}

/**
 * Extracts the first block ID inside a Scratch 3 substack input (SUBSTACK or SUBSTACK2).
 */
function extractSubstackHeadId(inputEntry) {
  if (!Array.isArray(inputEntry) || inputEntry.length < 2) return null;
  const head = inputEntry[1];
  return typeof head === "string" && head ? head : null;
}

/**
 * Collects all non-shadow blocks in a Scratch target along with graph traversal helpers.
 */
function getTargetRealBlocks(target) {
  const blocksMap = target && target.blocks && typeof target.blocks === "object" ? target.blocks : {};
  const list = [];
  for (const [id, blk] of Object.entries(blocksMap)) {
    if (!blk || typeof blk !== "object" || Array.isArray(blk)) continue;
    if (blk.shadow === true) continue;
    if (!blk.opcode) continue;
    list.push({ id, ...blk });
  }
  return { blocksMap, list };
}

/**
 * Walks all blocks reachable inside a substack chain (including nested substacks inside children).
 */
function collectSubstackBlocks(startBlockId, blocksMap, visited = new Set()) {
  const results = [];
  let cursor = startBlockId;
  while (cursor && typeof cursor === "string" && !visited.has(cursor)) {
    visited.add(cursor);
    const blk = blocksMap[cursor];
    if (!blk || typeof blk !== "object" || Array.isArray(blk)) break;
    if (blk.shadow !== true && blk.opcode) {
      results.push({ id: cursor, ...blk });
    }
    // Also traverse nested substacks (e.g. repeat inside forever, if inside repeat)
    if (blk.inputs && typeof blk.inputs === "object") {
      for (const key of ["SUBSTACK", "SUBSTACK2"]) {
        const nestedHead = extractSubstackHeadId(blk.inputs[key]);
        if (nestedHead) {
          results.push(...collectSubstackBlocks(nestedHead, blocksMap, visited));
        }
      }
    }
    cursor = typeof blk.next === "string" ? blk.next : null;
  }
  return results;
}

/**
 * Walks the linear `next` chain from a block ID (including descending into substacks when non-strict).
 */
function walkLinearChain(startBlockId, blocksMap) {
  const chain = [];
  const visited = new Set();
  let cursor = startBlockId;
  while (cursor && typeof cursor === "string" && !visited.has(cursor)) {
    visited.add(cursor);
    const blk = blocksMap[cursor];
    if (!blk || typeof blk !== "object" || Array.isArray(blk)) break;
    if (blk.shadow !== true && blk.opcode) {
      chain.push({ id: cursor, ...blk });
    }
    cursor = typeof blk.next === "string" ? blk.next : null;
  }
  return chain;
}

function compareValues(actualRaw, expectedRaw, comparison = "equals") {
  if (actualRaw === null || actualRaw === undefined) return false;
  const actual = String(actualRaw).trim();
  const expected = String(expectedRaw ?? "").trim();
  const mode = String(comparison || "equals").toLowerCase();

  if (mode === "contains") {
    return actual.toLowerCase().includes(expected.toLowerCase());
  }
  if (mode === "numeric_equals") {
    const a = Number(actual);
    const b = Number(expected);
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-6;
  }
  if (mode === "gte") {
    const a = Number(actual);
    const b = Number(expected);
    return Number.isFinite(a) && Number.isFinite(b) && a >= b;
  }
  if (mode === "lte") {
    const a = Number(actual);
    const b = Number(expected);
    return Number.isFinite(a) && Number.isFinite(b) && a <= b;
  }
  // Default 'equals': numeric equality if both parse cleanly, else case-insensitive string equality
  const numA = Number(actual);
  const numB = Number(expected);
  if (actual !== "" && expected !== "" && Number.isFinite(numA) && Number.isFinite(numB)) {
    return Math.abs(numA - numB) < 1e-6;
  }
  return actual.toLowerCase() === expected.toLowerCase();
}

function filterTargetsByScope(targets, scope = "any") {
  if (scope === "sprite") return targets.filter(t => !t.isStage);
  if (scope === "stage") return targets.filter(t => Boolean(t.isStage));
  return targets;
}

/**
 * Inspects a Scratch 3 project.json object and produces summary structural metrics.
 */
export function analyzeScratchProject(projectJson) {
  const targets = Array.isArray(projectJson?.targets) ? projectJson.targets : [];
  let totalBlocks = 0;
  let topLevelScripts = 0;
  let variableCount = 0;
  let listCount = 0;
  let costumeCount = 0;
  let soundCount = 0;
  const opcodesSet = new Set();

  for (const target of targets) {
    const { list } = getTargetRealBlocks(target);
    totalBlocks += list.length;
    for (const blk of list) {
      opcodesSet.add(blk.opcode);
      if (blk.topLevel === true) topLevelScripts += 1;
    }
    if (target.variables && typeof target.variables === "object") {
      variableCount += Object.keys(target.variables).length;
    }
    if (target.lists && typeof target.lists === "object") {
      listCount += Object.keys(target.lists).length;
    }
    if (Array.isArray(target.costumes)) costumeCount += target.costumes.length;
    if (Array.isArray(target.sounds)) soundCount += target.sounds.length;
  }

  return {
    spriteCount: targets.filter(t => !t.isStage).length,
    totalBlocks,
    topLevelScripts,
    variableCount,
    listCount,
    costumeCount,
    soundCount,
    opcodesUsed: Array.from(opcodesSet).sort(),
  };
}

/**
 * Evaluates a single structural grading criterion against a parsed Scratch 3 project.json.
 */
export function evaluateRubricCriterion(projectJson, criterion) {
  const targets = Array.isArray(projectJson?.targets) ? projectJson.targets : [];
  const scopedTargets = filterTargetsByScope(targets, criterion.targetScope || "any");
  const maxMarks = Math.max(0, Number(criterion.marks ?? 0) || 0);
  const type = String(criterion.type || "BLOCK_PRESENT");
  const label = String(criterion.label || "Criterion");
  const criterionId = String(criterion.id || label);

  const makeResult = (passed, feedback, partialMarks = null) => {
    const awarded =
      partialMarks !== null
        ? Math.max(0, Math.min(maxMarks, Number(partialMarks.toFixed(2))))
        : passed
        ? maxMarks
        : 0;
    return {
      criterionId,
      label,
      type,
      passed: Boolean(passed),
      awardedMarks: awarded,
      maxMarks,
      feedback,
    };
  };

  if (targets.length === 0) {
    return makeResult(false, "Project contains no valid stage or sprite targets.");
  }

  switch (type) {
    case "EVENT_BLOCK_USED": {
      const opcode = String(criterion.opcode || "event_whenflagclicked").trim();
      const requireAttached = criterion.requireAttachedScript !== false;
      let foundEvent = false;
      let foundConnected = false;

      for (const target of scopedTargets) {
        const { list } = getTargetRealBlocks(target);
        for (const blk of list) {
          if (blk.opcode === opcode) {
            foundEvent = true;
            if (typeof blk.next === "string" && blk.next.length > 0) {
              foundConnected = true;
            }
          }
        }
      }

      if (foundConnected || (foundEvent && !requireAttached)) {
        return makeResult(true, `Found required event block (${opcode})${requireAttached ? " connected to a script" : ""}.`);
      }
      if (foundEvent && requireAttached) {
        return makeResult(
          false,
          `Event block (${opcode}) was placed, but no action blocks are attached underneath it.`,
          maxMarks * 0.5
        );
      }
      return makeResult(false, `Missing required event block (${opcode}).`);
    }

    case "BLOCK_PRESENT": {
      const opcode = String(criterion.opcode || "").trim();
      const minCount = Math.max(1, Number(criterion.minCount || 1) || 1);
      if (!opcode) return makeResult(false, "Rubric criterion missing required opcode.");
      let count = 0;
      for (const target of scopedTargets) {
        const { list } = getTargetRealBlocks(target);
        for (const blk of list) {
          if (blk.opcode === opcode) count += 1;
        }
      }
      if (count >= minCount) {
        return makeResult(true, `Found ${count} matching ${opcode} block(s) (minimum ${minCount}).`);
      }
      return makeResult(false, `Expected at least ${minCount} ${opcode} block(s), found ${count}.`);
    }

    case "BLOCK_INPUT_VALUE": {
      const opcode = String(criterion.opcode || "").trim();
      const inputName = String(criterion.inputName || "").trim();
      const expectedValue = String(criterion.expectedValue ?? "").trim();
      const comparison = criterion.comparison || "equals";
      if (!opcode || !inputName) {
        return makeResult(false, "Rubric criterion missing opcode or inputName.");
      }

      let foundBlock = false;
      const observedValues = [];
      for (const target of scopedTargets) {
        const { blocksMap, list } = getTargetRealBlocks(target);
        for (const blk of list) {
          if (blk.opcode !== opcode) continue;
          foundBlock = true;
          const rawInput = blk.inputs?.[inputName];
          const val = extractScratchInputValue(rawInput, blocksMap);
          if (val !== null) observedValues.push(val);
          if (compareValues(val, expectedValue, comparison)) {
            return makeResult(true, `Matched ${opcode} with ${inputName} = ${val}.`);
          }
        }
      }

      if (foundBlock) {
        return makeResult(
          false,
          `Found ${opcode}, but ${inputName} was [${observedValues.join(", ") || "empty"}] instead of expected "${expectedValue}".`
        );
      }
      return makeResult(false, `Missing ${opcode} block with ${inputName} = "${expectedValue}".`);
    }

    case "BLOCK_FIELD_VALUE": {
      const opcode = String(criterion.opcode || "").trim();
      const fieldName = String(criterion.fieldName || "").trim();
      const expectedValue = String(criterion.expectedValue ?? "").trim();
      if (!opcode || !fieldName) {
        return makeResult(false, "Rubric criterion missing opcode or fieldName.");
      }

      let foundBlock = false;
      for (const target of scopedTargets) {
        const { list } = getTargetRealBlocks(target);
        for (const blk of list) {
          if (blk.opcode !== opcode) continue;
          foundBlock = true;
          const fieldArr = blk.fields?.[fieldName];
          const val = Array.isArray(fieldArr) ? String(fieldArr[0] ?? "").trim() : "";
          if (compareValues(val, expectedValue, "equals")) {
            return makeResult(true, `Matched ${opcode} with field ${fieldName} = "${val}".`);
          }
        }
      }
      if (foundBlock) {
        return makeResult(false, `Found ${opcode}, but field ${fieldName} did not match "${expectedValue}".`);
      }
      return makeResult(false, `Missing ${opcode} block with ${fieldName} = "${expectedValue}".`);
    }

    case "BLOCK_SEQUENCE": {
      const opcodes = Array.isArray(criterion.opcodes)
        ? criterion.opcodes.map(o => String(o || "").trim()).filter(Boolean)
        : [];
      const strictAdjacent = criterion.strictAdjacent === true;
      if (opcodes.length < 2) {
        return makeResult(false, "Sequence criterion requires at least 2 opcodes.");
      }

      for (const target of scopedTargets) {
        const { blocksMap, list } = getTargetRealBlocks(target);
        for (const blk of list) {
          if (blk.opcode !== opcodes[0]) continue;
          const chain = walkLinearChain(blk.id, blocksMap);
          if (strictAdjacent) {
            if (
              chain.length >= opcodes.length &&
              opcodes.every((op, idx) => chain[idx]?.opcode === op)
            ) {
              return makeResult(true, `Matched strict block sequence: ${opcodes.join(" -> ")}.`);
            }
          } else {
            // Ordered subsequence match along the connected chain (allows intermediate blocks & ignores canvas x/y)
            let seqIdx = 0;
            for (const step of chain) {
              if (step.opcode === opcodes[seqIdx]) {
                seqIdx += 1;
                if (seqIdx === opcodes.length) {
                  return makeResult(true, `Matched connected block sequence: ${opcodes.join(" -> ")}.`);
                }
              }
            }
          }
        }
      }
      return makeResult(false, `Did not find connected execution sequence: ${opcodes.join(" -> ")}.`);
    }

    case "BLOCK_NESTED": {
      const outerOpcode = String(criterion.outerOpcode || "control_repeat").trim();
      const innerOpcode = String(criterion.innerOpcode || "").trim();
      const outerInputName = String(criterion.outerInputName || "").trim();
      const outerExpectedValue =
        criterion.outerExpectedValue !== undefined ? String(criterion.outerExpectedValue).trim() : "";

      if (!outerOpcode || !innerOpcode) {
        return makeResult(false, "Nested criterion requires both outerOpcode and innerOpcode.");
      }

      let foundOuter = false;
      let foundNestedWrongInput = false;

      for (const target of scopedTargets) {
        const { blocksMap, list } = getTargetRealBlocks(target);
        for (const blk of list) {
          if (blk.opcode !== outerOpcode) continue;
          foundOuter = true;
          const substackHeads = [
            extractSubstackHeadId(blk.inputs?.SUBSTACK),
            extractSubstackHeadId(blk.inputs?.SUBSTACK2),
          ].filter(Boolean);

          const nestedBlocks = substackHeads.flatMap(head => collectSubstackBlocks(head, blocksMap));
          const hasInner = nestedBlocks.some(nb => nb.opcode === innerOpcode);
          if (!hasInner) continue;

          if (outerInputName && outerExpectedValue !== "") {
            const actualOuterVal = extractScratchInputValue(blk.inputs?.[outerInputName], blocksMap);
            if (compareValues(actualOuterVal, outerExpectedValue, "equals")) {
              return makeResult(
                true,
                `Found ${innerOpcode} nested inside ${outerOpcode} (${outerInputName} = ${actualOuterVal}).`
              );
            }
            foundNestedWrongInput = true;
          } else {
            return makeResult(true, `Found ${innerOpcode} nested inside ${outerOpcode}.`);
          }
        }
      }

      if (foundNestedWrongInput) {
        return makeResult(
          false,
          `Found ${innerOpcode} inside ${outerOpcode}, but ${outerInputName} did not match "${outerExpectedValue}".`,
          maxMarks * 0.5
        );
      }
      if (foundOuter) {
        return makeResult(false, `Found ${outerOpcode}, but ${innerOpcode} is not placed inside it.`);
      }
      return makeResult(false, `Missing ${outerOpcode} containing ${innerOpcode}.`);
    }

    case "VARIABLE_OR_LIST_USED": {
      const kind = String(criterion.variableKind || "variable").toLowerCase();
      const expectedName = String(criterion.variableName || "").trim().toLowerCase();
      const requireRef = criterion.requireReferencedInBlocks !== false;

      const declaredNames = new Set();
      const referencedNames = new Set();

      for (const target of targets) {
        if ((kind === "variable" || kind === "either") && target.variables && typeof target.variables === "object") {
          for (const tuple of Object.values(target.variables)) {
            if (Array.isArray(tuple) && tuple[0]) declaredNames.add(String(tuple[0]).trim().toLowerCase());
          }
        }
        if ((kind === "list" || kind === "either") && target.lists && typeof target.lists === "object") {
          for (const tuple of Object.values(target.lists)) {
            if (Array.isArray(tuple) && tuple[0]) declaredNames.add(String(tuple[0]).trim().toLowerCase());
          }
        }
        const { list } = getTargetRealBlocks(target);
        for (const blk of list) {
          if (blk.fields && typeof blk.fields === "object") {
            if ((kind === "variable" || kind === "either") && Array.isArray(blk.fields.VARIABLE)) {
              referencedNames.add(String(blk.fields.VARIABLE[0] || "").trim().toLowerCase());
            }
            if ((kind === "list" || kind === "either") && Array.isArray(blk.fields.LIST)) {
              referencedNames.add(String(blk.fields.LIST[0] || "").trim().toLowerCase());
            }
          }
          if (blk.inputs && typeof blk.inputs === "object") {
            for (const entry of Object.values(blk.inputs)) {
              if (!Array.isArray(entry)) continue;
              const inner = entry[1];
              if (Array.isArray(inner) && (inner[0] === 12 || inner[0] === 13) && inner[1]) {
                if ((inner[0] === 12 && (kind === "variable" || kind === "either")) ||
                    (inner[0] === 13 && (kind === "list" || kind === "either"))) {
                  referencedNames.add(String(inner[1]).trim().toLowerCase());
                }
              }
            }
          }
        }
      }

      if (expectedName) {
        const hasDeclared = declaredNames.has(expectedName);
        const hasRef = referencedNames.has(expectedName);
        if (hasDeclared && (!requireRef || hasRef)) {
          return makeResult(true, `Found required ${kind} "${criterion.variableName}"${requireRef ? " used in blocks" : ""}.`);
        }
        if (hasDeclared && requireRef) {
          return makeResult(
            false,
            `Declared ${kind} "${criterion.variableName}", but it is not referenced in any blocks.`,
            maxMarks * 0.5
          );
        }
        return makeResult(false, `Missing required ${kind} named "${criterion.variableName}".`);
      }

      if (declaredNames.size > 0 && (!requireRef || referencedNames.size > 0)) {
        return makeResult(true, `Found ${declaredNames.size} ${kind}(s) used in the project.`);
      }
      if (declaredNames.size > 0 && requireRef) {
        return makeResult(false, `A ${kind} was created, but it is not used inside any programming blocks.`, maxMarks * 0.5);
      }
      return makeResult(false, `No ${kind} found in the project.`);
    }

    case "SPRITE_COUNT": {
      const sprites = targets.filter(t => !t.isStage);
      const minSprites = Math.max(1, Number(criterion.minSprites || 1) || 1);
      const maxSprites = criterion.maxSprites ? Number(criterion.maxSprites) : null;
      const meetsMin = sprites.length >= minSprites;
      const meetsMax = maxSprites === null || sprites.length <= maxSprites;
      if (meetsMin && meetsMax) {
        return makeResult(true, `Project has ${sprites.length} sprite(s) (required minimum ${minSprites}).`);
      }
      return makeResult(
        false,
        `Project has ${sprites.length} sprite(s); required at least ${minSprites}${maxSprites ? ` and at most ${maxSprites}` : ""}.`
      );
    }

    case "COSTUME_OR_BACKDROP_CHECK": {
      const assetKind = criterion.assetTargetKind === "stage" ? "stage" : "sprite";
      const minCount = Math.max(1, Number(criterion.minCount || 1) || 1);
      const relevant = assetKind === "stage" ? targets.filter(t => t.isStage) : targets.filter(t => !t.isStage);
      const maxObserved = relevant.reduce((max, t) => Math.max(max, Array.isArray(t.costumes) ? t.costumes.length : 0), 0);
      if (maxObserved >= minCount) {
        return makeResult(
          true,
          `Found ${maxObserved} ${assetKind === "stage" ? "backdrop(s)" : "costume(s)"} (minimum ${minCount}).`
        );
      }
      return makeResult(
        false,
        `Expected at least ${minCount} ${assetKind === "stage" ? "backdrop(s)" : "costume(s)"}, found ${maxObserved}.`
      );
    }

    default:
      return makeResult(false, `Unsupported rubric criterion type: ${type}`);
  }
}

/**
 * Runs all automatic structural rubric criteria against a Scratch 3 project.json.
 */
export function gradeScratchProject(projectJson, rubricCriteria = []) {
  const summaryMetrics = analyzeScratchProject(projectJson);
  const criteria = Array.isArray(rubricCriteria) ? rubricCriteria : [];
  const criterionResults = criteria.map(c => evaluateRubricCriterion(projectJson, c));

  const automaticScore = Number(
    criterionResults.reduce((acc, item) => acc + Number(item.awardedMarks || 0), 0).toFixed(2)
  );
  const maxAutomaticScore = Number(
    criterionResults.reduce((acc, item) => acc + Number(item.maxMarks || 0), 0).toFixed(2)
  );
  const percentage =
    maxAutomaticScore > 0 ? Number(((automaticScore / maxAutomaticScore) * 100).toFixed(2)) : 0;

  return {
    automaticScore,
    maxAutomaticScore,
    percentage,
    criterionResults,
    summaryMetrics,
    gradedAt: new Date().toISOString(),
  };
}
