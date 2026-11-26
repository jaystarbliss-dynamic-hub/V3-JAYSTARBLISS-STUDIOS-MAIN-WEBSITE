import test from "node:test";
import assert from "node:assert/strict";

import { gradeScratchProject } from "../api/_lib/coding-lab-grader.js";
import {
  isSafeSb3EntryPath,
  sanitizeSvgContent,
  validateScratchProjectJson,
  sha256Hex,
  compressProjectJson,
  decompressAndVerifyProjectJson,
  splitPayloadForFirestore,
  reassemblePayloadChunks,
} from "../api/_lib/coding-lab-sb3-security.js";
import {
  normalizeDeliveryMode,
  validateExamCreationPayload,
} from "../api/_lib/jdi-assessment.js";

function makeSampleScratchProject() {
  return {
    targets: [
      {
        isStage: true,
        name: "Stage",
        variables: {
          var_score: ["score", 0],
        },
        lists: {
          list_items: ["items", []],
        },
        broadcasts: {},
        blocks: {},
        comments: {},
        currentCostume: 0,
        costumes: [
          {
            name: "backdrop1",
            dataFormat: "svg",
            assetId: "a".repeat(32),
            md5ext: `${"a".repeat(32)}.svg`,
          },
          {
            name: "xy_grid",
            dataFormat: "svg",
            assetId: "b".repeat(32),
            md5ext: `${"b".repeat(32)}.svg`,
          },
        ],
        sounds: [],
        volume: 100,
      },
      {
        isStage: false,
        name: "Robo",
        variables: {},
        lists: {},
        broadcasts: {},
        blocks: {
          b_flag: {
            opcode: "event_whenflagclicked",
            next: "b_setvar",
            parent: null,
            inputs: {},
            fields: {},
            topLevel: true,
            x: 240,
            y: -120,
          },
          b_setvar: {
            opcode: "data_setvariableto",
            next: "b_repeat",
            parent: "b_flag",
            inputs: {
              VALUE: [1, [10, "0"]],
            },
            fields: {
              VARIABLE: ["score", "var_score"],
            },
            topLevel: false,
          },
          b_repeat: {
            opcode: "control_repeat",
            next: "b_say",
            parent: "b_setvar",
            inputs: {
              TIMES: [1, [6, "4"]],
              SUBSTACK: [2, "b_move"],
            },
            fields: {},
            topLevel: false,
          },
          b_move: {
            opcode: "motion_movesteps",
            next: "b_turn",
            parent: "b_repeat",
            inputs: {
              STEPS: [1, [4, "50"]],
            },
            fields: {},
            topLevel: false,
          },
          b_turn: {
            opcode: "motion_turnright",
            next: null,
            parent: "b_move",
            inputs: {
              DEGREES: [1, [4, "90"]],
            },
            fields: {},
            topLevel: false,
          },
          b_say: {
            opcode: "looks_sayforsecs",
            next: null,
            parent: "b_repeat",
            inputs: {
              MESSAGE: [1, [10, "Square Complete!"]],
              SECS: [1, [4, "2"]],
            },
            fields: {},
            topLevel: false,
          },
        },
        comments: {},
        currentCostume: 0,
        costumes: [
          {
            name: "robo_a",
            dataFormat: "svg",
            assetId: "c".repeat(32),
            md5ext: `${"c".repeat(32)}.svg`,
          },
        ],
        sounds: [],
        volume: 100,
      },
      {
        isStage: false,
        name: "Star",
        variables: {},
        lists: {},
        broadcasts: {},
        blocks: {},
        comments: {},
        currentCostume: 0,
        costumes: [
          {
            name: "star_a",
            dataFormat: "svg",
            assetId: "d".repeat(32),
            md5ext: `${"d".repeat(32)}.svg`,
          },
        ],
        sounds: [],
        volume: 100,
      },
    ],
    monitors: [],
    extensions: [],
    meta: { semver: "3.0.0", vm: "15.3.0", agent: "CodingLab" },
  };
}

test("Structural grading engine evaluates all 9 criterion types deterministically and position-independently", () => {
  const project = makeSampleScratchProject();
  const criteria = [
    {
      id: "c1",
      label: "Uses Green Flag event",
      type: "EVENT_BLOCK_USED",
      marks: 2,
      opcode: "event_whenflagclicked",
      requireAttachedScript: true,
    },
    {
      id: "c2",
      label: "Uses turn right block",
      type: "BLOCK_PRESENT",
      marks: 2,
      opcode: "motion_turnright",
      minCount: 1,
    },
    {
      id: "c3",
      label: "Moves 50 steps",
      type: "BLOCK_INPUT_VALUE",
      marks: 3,
      opcode: "motion_movesteps",
      inputName: "STEPS",
      expectedValue: "50",
      comparison: "numeric_equals",
    },
    {
      id: "c4",
      label: "Sets score variable field",
      type: "BLOCK_FIELD_VALUE",
      marks: 2,
      opcode: "data_setvariableto",
      fieldName: "VARIABLE",
      expectedValue: "score",
    },
    {
      id: "c5",
      label: "Sequence: Green Flag -> Set Variable -> Repeat",
      type: "BLOCK_SEQUENCE",
      marks: 3,
      opcodes: ["event_whenflagclicked", "data_setvariableto", "control_repeat"],
      strictAdjacent: true,
    },
    {
      id: "c6",
      label: "Nested Move inside Repeat 4",
      type: "BLOCK_NESTED",
      marks: 3,
      outerOpcode: "control_repeat",
      innerOpcode: "motion_movesteps",
      outerInputName: "TIMES",
      outerExpectedValue: "4",
    },
    {
      id: "c7",
      label: "Uses score variable",
      type: "VARIABLE_OR_LIST_USED",
      marks: 2,
      variableKind: "variable",
      variableName: "score",
      requireReferencedInBlocks: true,
    },
    {
      id: "c8",
      label: "At least 2 sprites",
      type: "SPRITE_COUNT",
      marks: 2,
      minSprites: 2,
    },
    {
      id: "c9",
      label: "At least 2 backdrops on Stage",
      type: "COSTUME_OR_BACKDROP_CHECK",
      marks: 1,
      assetTargetKind: "stage",
      minCount: 2,
    },
  ];

  const res = gradeScratchProject(project, criteria);
  assert.equal(res.automaticScore, 20);
  assert.equal(res.maxAutomaticScore, 20);
  assert.equal(res.percentage, 100);
  assert.equal(res.criterionResults.length, 9);
  assert.ok(res.criterionResults.every((c) => c.passed));
  assert.equal(res.summaryMetrics.spriteCount, 2);
  assert.equal(res.summaryMetrics.totalBlocks, 6);

  // Move x/y coordinates arbitrarily and verify score is identical (position-independent)
  project.targets[1].blocks.b_flag.x = -980;
  project.targets[1].blocks.b_flag.y = 750;
  const resMoved = gradeScratchProject(project, criteria);
  assert.equal(resMoved.automaticScore, 20);
});

test("Structural grading engine awards partial marks and handles empty/missing blocks safely", () => {
  const partialProject = {
    targets: [
      { isStage: true, name: "Stage", blocks: {}, costumes: [], sounds: [], variables: {}, lists: {} },
      { isStage: false, name: "Robo", blocks: {}, costumes: [], sounds: [], variables: {}, lists: {} },
    ],
  };
  const criteria = [
    { id: "p1", label: "Green Flag", type: "EVENT_BLOCK_USED", marks: 5, opcode: "event_whenflagclicked" },
    { id: "p2", label: "Between 1 and 2 sprites", type: "SPRITE_COUNT", marks: 5, minSprites: 1, maxSprites: 2 },
  ];
  const res = gradeScratchProject(partialProject, criteria);
  assert.equal(res.automaticScore, 5);
  assert.equal(res.maxAutomaticScore, 10);
  assert.equal(res.percentage, 50);
  assert.equal(res.criterionResults[0].passed, false);
  assert.equal(res.criterionResults[1].passed, true);
});

test("Security utilities block zip path traversal, sanitize SVG XSS, and reject unsafe project.json extensions", () => {
  assert.equal(isSafeSb3EntryPath("project.json"), true);
  assert.equal(isSafeSb3EntryPath("abcdef0123456789abcdef0123456789.svg"), true);
  assert.equal(isSafeSb3EntryPath("../evil.svg"), false);
  assert.equal(isSafeSb3EntryPath("/etc/passwd"), false);
  assert.equal(isSafeSb3EntryPath("dir\\file.png"), false);

  const dirtySvg =
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>evil()</script><a href="javascript:alert(2)"><rect width="10" height="10"/></a><foreignObject><div>x</div></foreignObject></svg>';
  const { sanitized: cleanSvg, hadUnsafeContent } = sanitizeSvgContent(dirtySvg);
  assert.equal(hadUnsafeContent, true);
  assert.equal(cleanSvg.toLowerCase().includes("<script"), false);
  assert.equal(cleanSvg.toLowerCase().includes("onload"), false);
  assert.equal(cleanSvg.toLowerCase().includes("javascript:"), false);
  assert.equal(cleanSvg.toLowerCase().includes("foreignobject"), false);

  const validCheck = validateScratchProjectJson(makeSampleScratchProject());
  assert.equal(validCheck.valid, true);

  const badExtProject = {
    ...makeSampleScratchProject(),
    extensionURLs: { custom: "https://evil.example/ext.js" },
  };
  const invalidCheck = validateScratchProjectJson(badExtProject);
  assert.equal(invalidCheck.valid, false);
});

test("Hybrid Firestore compression, chunking, SHA-256 deduplication, and tamper detection work end-to-end", async () => {
  // 1. Small project stays inline (chunkCount === 0)
  const smallProject = makeSampleScratchProject();
  const smallCompressed = await compressProjectJson(smallProject);
  const smallSplit = splitPayloadForFirestore(smallCompressed.bytes);
  assert.equal(smallSplit.storageMode, "inline");
  assert.equal(smallSplit.chunkCount, 0);
  const smallRestored = await decompressAndVerifyProjectJson(
    smallSplit.inlineBytes,
    smallCompressed.compression,
    smallCompressed.hash
  );
  assert.equal(smallRestored.targets.length, 3);

  // 2. Tampered hash is rejected
  await assert.rejects(
    () =>
      decompressAndVerifyProjectJson(
        smallSplit.inlineBytes,
        smallCompressed.compression,
        "0".repeat(64)
      ),
    /hash|integrity|mismatch/i
  );

  // 3. Large synthetic incompressible byte buffer splits cleanly into <=350 KiB chunks
  const syntheticLarge = new Uint8Array(800 * 1024);
  for (let i = 0; i < syntheticLarge.length; i++) {
    syntheticLarge[i] = (i * 31 + 17) & 0xff;
  }
  const chunked = splitPayloadForFirestore(syntheticLarge, 700 * 1024, 350 * 1024);
  assert.equal(chunked.storageMode, "chunked");
  assert.equal(chunked.chunkCount, 3);
  assert.ok(chunked.chunks.every((c) => c.sizeBytes <= 350 * 1024));
  const reassembled = reassemblePayloadChunks(chunked.chunks);
  assert.equal(reassembled.byteLength, syntheticLarge.byteLength);
  assert.equal(await sha256Hex(reassembled), await sha256Hex(syntheticLarge));

  // 4. Deterministic SHA-256 deduplication
  const imgA = new TextEncoder().encode("<svg><circle r='10'/></svg>");
  const imgB = new TextEncoder().encode("<svg><circle r='10'/></svg>");
  const imgC = new TextEncoder().encode("<svg><circle r='12'/></svg>");
  assert.equal(await sha256Hex(imgA), await sha256Hex(imgB));
  assert.notEqual(await sha256Hex(imgA), await sha256Hex(imgC));
});

test("Assessment domain supports CODING_LAB without breaking NATIVE or EXTERNAL_LINK", () => {
  assert.equal(normalizeDeliveryMode("CODING_LAB"), "CODING_LAB");
  assert.equal(normalizeDeliveryMode("EXTERNAL_LINK"), "EXTERNAL_LINK");
  assert.equal(normalizeDeliveryMode("NATIVE"), "NATIVE");

  const codingValid = validateExamCreationPayload({
    title: "Draw a Square in Coding Lab",
    subject: "Creative Coding",
    deliveryMode: "CODING_LAB",
    workType: "ASSIGNMENT",
    status: "active",
    codingLabConfig: {
      gradingMethod: "automatic",
      rubricCriteria: [
        {
          id: "c1",
          label: "Uses Green Flag",
          type: "EVENT_BLOCK_USED",
          marks: 10,
          opcode: "event_whenflagclicked",
        },
      ],
    },
  });
  assert.ok(!("error" in codingValid));
  assert.equal(codingValid.deliveryMode, "CODING_LAB");
  assert.equal(codingValid.maxScore, 10);
  assert.equal(codingValid.codingLabConfig?.disableCustomAudio, true);
  assert.equal(codingValid.codingLabConfig?.disableMicrophoneRecording, true);

  // Automatic grading without criteria cannot publish
  const codingMissingRubric = validateExamCreationPayload({
    title: "Broken Auto Coding Exam",
    subject: "Creative Coding",
    deliveryMode: "CODING_LAB",
    workType: "ASSIGNMENT",
    status: "active",
    codingLabConfig: {
      gradingMethod: "automatic",
      rubricCriteria: [],
    },
  });
  assert.ok("error" in codingMissingRubric);

  // Existing EXTERNAL_LINK & NATIVE remain unaffected
  const extValid = validateExamCreationPayload({
    title: "External Quiz",
    subject: "Math",
    deliveryMode: "EXTERNAL_LINK",
    externalUrl: "https://forms.gle/example123",
    status: "active",
  });
  assert.ok(!("error" in extValid));
  assert.equal(extValid.deliveryMode, "EXTERNAL_LINK");
});
