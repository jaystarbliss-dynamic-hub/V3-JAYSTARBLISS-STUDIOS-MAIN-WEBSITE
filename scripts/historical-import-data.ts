import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  Timestamp
} from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

interface StudentImportRecord {
  year: number;
  name: string;
  originalTimestamp: string;
  originalScore: number;
  expectedImportedScore: number;
  answers: string[];
}

export const HISTORICAL_STUDENTS: StudentImportRecord[] = [
  // YEAR 1
  {
    year: 1,
    name: "Jayden Eze",
    originalTimestamp: "28 October 2026, 11:44:12",
    originalScore: 7,
    expectedImportedScore: 14,
    answers: [
      "electronic machine",
      "electricity",
      "desktop system unit",
      "keyboard",
      "mouse",
      "CPU",
      "print a page",
      "opening a program",
      "keep clicking quickly",
      "Backspace",
      "hold Shift and press the letter",
      "the whole program",
      "use clean, dry hands",
      "food and drinks",
      "hit the monitor"
    ]
  },
  {
    year: 1,
    name: "NathAniel Okenla",
    originalTimestamp: "28 October 2026, 11:48:17",
    originalScore: 8,
    expectedImportedScore: 16,
    answers: [
      "electronic machine",
      "electricity",
      "laptop",
      "mouse",
      "CPU",
      "mouse",
      "select an item",
      "typing a sentence",
      "wait while the computer works",
      "Space Bar",
      "press Space Bar twice",
      "the next line",
      "use wet hands",
      "food and drinks",
      "gently move the mouse or press a key"
    ]
  },
  {
    year: 1,
    name: "Chizaram",
    originalTimestamp: "28 October 2026, 12:07:39",
    originalScore: 8,
    expectedImportedScore: 16,
    answers: [
      "living thing",
      "electricity",
      "monitor",
      "mouse",
      "monitor",
      "CPU",
      "turn off the computer",
      "opening a program",
      "keep clicking quickly",
      "Space Bar",
      "hold Shift and press the letter",
      "the character just before the cursor",
      "bang the keys",
      "food and drinks",
      "gently move the mouse or press a key"
    ]
  },
  {
    year: 1,
    name: "ugonnaya okoye",
    originalTimestamp: "28 October 2026, 12:09:06",
    originalScore: 7,
    expectedImportedScore: 14,
    answers: [
      "electronic machine",
      "electricity",
      "desktop system unit",
      "mouse",
      "keyboard",
      "monitor",
      "delete a file",
      "typing a sentence",
      "keep clicking quickly",
      "Space Bar",
      "press Enter first",
      "the next line",
      "use clean, dry hands",
      "food and drinks",
      "gently move the mouse or press a key"
    ]
  },
  {
    year: 1,
    name: "hanameel",
    originalTimestamp: "28 October 2026, 12:09:25",
    originalScore: 4,
    expectedImportedScore: 8,
    answers: [
      "paper book",
      "water",
      "desktop system unit",
      "monitor",
      "CPU",
      "CPU",
      "print a page",
      "opening a program",
      "keep clicking quickly",
      "Enter",
      "press Backspace first",
      "the character just before the cursor",
      "bang the keys",
      "your notebook",
      "hit the monitor"
    ]
  },

  // YEAR 2
  {
    year: 2,
    name: "Kosi",
    originalTimestamp: "28 October 2026, 12:05:17",
    originalScore: 6,
    expectedImportedScore: 12,
    answers: [
      "mouse",
      "Shift + letter",
      "Ctrl + S",
      "a group of words expressing a complete thought",
      "with a comma",
      "full stop",
      "the whole folder",
      "the character on the right",
      "changing the screen colour",
      "move an object on the screen to another place",
      "release the mouse before moving",
      "the computer shuts down",
      "typing capital letters",
      "New file",
      "press Space Bar"
    ]
  },
  {
    year: 2,
    name: "Zino",
    originalTimestamp: "28 October 2026, 12:08:07",
    originalScore: 8,
    expectedImportedScore: 16,
    answers: [
      "mouse",
      "Shift + letter",
      "Ctrl + S",
      "a group of words expressing a complete thought",
      "with a capital letter",
      "full stop",
      "the whole folder",
      "the character on the left",
      "closing a program without saving",
      "move an object on the screen to another place",
      "hold the left mouse button, move the item, then release",
      "the file is deleted",
      "moving the mouse pointer",
      "Year2_Amina_Typing",
      "press Caps Lock"
    ]
  },

  // YEAR 3
  {
    year: 3,
    name: "Zina Chimezie Chimdaalu Ukaamka",
    originalTimestamp: "28 October 2026, 12:32:24",
    originalScore: 14,
    expectedImportedScore: 28,
    answers: [
      "Ctrl + S",
      "makes selected text bold",
      "keep personal information private",
      "creating and editing text documents on a computer",
      ".docx",
      "automatically moves text to the next line as it reaches the margin",
      "makes a duplicate while the original stays",
      "removes the selected content so it can be placed elsewhere",
      "places copied or cut content at the cursor",
      "when steps must be in strict order",
      "when order or sequence matters",
      "Home tab",
      "blank spaces between the page edge and the text",
      "Layout > Margins",
      "Ctrl + E"
    ]
  },
  {
    year: 3,
    name: "ginka oshai",
    originalTimestamp: "28 October 2026, 12:32:44",
    originalScore: 3,
    expectedImportedScore: 6,
    answers: [
      "Ctrl + B",
      "makes selected text bold",
      "keep personal information private",
      "drawing only with a mouse",
      ".docx",
      "deletes every space",
      "removes the original text",
      "makes text bold",
      "undoes the last action",
      "when ranking scores from highest to lowest",
      "for unrelated features in no order",
      "Status bar only",
      "the colour of text",
      "Review > Spelling",
      "Ctrl + L"
    ]
  },
  {
    year: 3,
    name: "Opeyemi Akinyosoye",
    originalTimestamp: "28 October 2026, 12:35:43",
    originalScore: 5,
    expectedImportedScore: 10,
    answers: [
      "Ctrl + V",
      "makes selected text bold",
      "open every website",
      "creating and editing text documents on a computer",
      ".docx",
      "saves a document",
      "removes the original text",
      "removes the selected content so it can be placed elsewhere",
      "undoes the last action",
      "when steps must be in strict order",
      "only for pictures",
      "Home tab",
      "the colour of text",
      "Review > Spelling",
      "Ctrl + L"
    ]
  },
  {
    year: 3,
    name: "Jason oyeniyi",
    originalTimestamp: "28 October 2026, 12:40:12",
    originalScore: 9,
    expectedImportedScore: 18,
    answers: [
      "Ctrl + S",
      "copies a file",
      "keep personal information private",
      "creating and editing text documents on a computer",
      ".docx",
      "automatically moves text to the next line as it reaches the margin",
      "removes the original text",
      "removes the selected content so it can be placed elsewhere",
      "places copied or cut content at the cursor",
      "when ranking scores from highest to lowest",
      "to change font size",
      "Home tab",
      "the number of words in a document",
      "Layout > Margins",
      "Ctrl + L"
    ]
  },

  // YEAR 4
  {
    year: 4,
    name: "Esther chimamanda",
    originalTimestamp: "28 October 2026, 13:14:59",
    originalScore: 11,
    expectedImportedScore: 22,
    answers: [
      "check its author and date and compare with other sources",
      "leave more room for text",
      "justify text between both margins",
      "a printed chart",
      "column C, row 4",
      "the currently selected cell",
      "=",
      "=SUM(B2:B6)",
      "80",
      "the words typed in a cell only",
      "deletes empty rows",
      "it displays as 75%",
      "smallest to largest",
      "descending",
      "shows matching rows and hides rows that do not match the chosen condition"
    ]
  },
  {
    year: 4,
    name: "sarah koleoso",
    originalTimestamp: "28 October 2026, 13:25:59",
    originalScore: 8,
    expectedImportedScore: 16,
    answers: [
      "check its author and date and compare with other sources",
      "leave more room for text",
      "justify text between both margins",
      "an Excel file that can contain worksheets",
      "column C, row 4",
      "the title bar",
      "+",
      "=SUM(B2:B6)",
      "80",
      "the formula result",
      "sorts data from A to Z",
      "it displays as 7.5",
      "largest to smallest",
      "descending",
      "shows matching rows and hides rows that do not match the chosen condition"
    ]
  },
  {
    year: 4,
    name: "Precious agofure",
    originalTimestamp: "28 October 2026, 13:28:23",
    originalScore: 7,
    expectedImportedScore: 14,
    answers: [
      "check its author and date and compare with other sources",
      "leave more room for text",
      "align text to the right",
      "an Excel file that can contain worksheets",
      "column C, row 4",
      "the title bar",
      "+",
      "SUM=B2:B6",
      "75",
      "the cell background",
      "adds a formula",
      "it displays as 7.5",
      "largest to smallest",
      "alphabetical by first name",
      "shows matching rows and hides rows that do not match the chosen condition"
    ]
  },
  {
    year: 4,
    name: "Egbo ifechukwu Anthony",
    originalTimestamp: "28 October 2026, 13:34:53",
    originalScore: 4,
    expectedImportedScore: 8,
    answers: [
      "check its author and date and compare with other sources",
      "leave more room for text",
      "align text to the left",
      "a printed chart",
      "column C, row 4",
      "the worksheet that is closed",
      "+",
      "=SUM(B2:B6)",
      "70",
      "the words typed in a cell only",
      "sorts data from A to Z",
      "it becomes 0.075",
      "largest to smallest",
      "ascending",
      "changes every number into text"
    ]
  },

  // YEAR 5
  {
    year: 5,
    name: "esther akpotoboro",
    originalTimestamp: "28 October 2026, 13:25:26",
    originalScore: 9,
    expectedImportedScore: 18,
    answers: [
      "bar chart",
      "password",
      "sorting",
      "only a conclusion",
      "introduce many new facts",
      "Heading 2",
      "the highest value in a range",
      "only formulas that return zero",
      "Fail",
      "presentations made of slides",
      ".docx",
      "the presenter, not the audience",
      "Insert > Pictures > This Device",
      "drag a corner handle",
      "every image should have a purpose and should not cover the text"
    ]
  },
  {
    year: 5,
    name: "Akinyosoye damilola",
    originalTimestamp: "28 October 2026, 13:33:14",
    originalScore: 11,
    expectedImportedScore: 22,
    answers: [
      "bar chart",
      "a long mix of uppercase and lowercase letters, numbers and symbols",
      "plagiarism",
      "title, introduction, body sections and conclusion",
      "introduce many new facts",
      "Heading 2",
      "the highest value in a range",
      "cells containing any data, including text or numbers",
      "Pass",
      "presentations made of slides",
      ".docx",
      "the presenter, not the audience",
      "Insert > Pictures > This Device",
      "drag only the middle-left handle",
      "every image should have a purpose and should not cover the text"
    ]
  },
  {
    year: 5,
    name: "NAOMI NDUKA",
    originalTimestamp: "28 October 2026, 13:34:46",
    originalScore: 9,
    expectedImportedScore: 18,
    answers: [
      "bar chart",
      "password",
      "proofreading",
      "title, introduction, body sections and conclusion",
      "introduce many new facts",
      "Heading 1 only for every paragraph",
      "the highest value in a range",
      "cells containing any data, including text or numbers",
      "Fail",
      "presentations made of slides",
      ".docx",
      "the presenter, not the audience",
      "Insert > Pictures > This Device",
      "stretch it until it looks narrow",
      "every image should have a purpose and should not cover the text"
    ]
  },
  {
    year: 5,
    name: "Kandili okoye",
    originalTimestamp: "28 October 2026, 13:36:48",
    originalScore: 13,
    expectedImportedScore: 26,
    answers: [
      "bar chart",
      "a long mix of uppercase and lowercase letters, numbers and symbols",
      "proofreading",
      "title, introduction, body sections and conclusion",
      "summarise what has already been presented",
      "Heading 2",
      "the highest value in a range",
      "cells containing any data, including text or numbers",
      "Fail",
      "presentations made of slides",
      ".pptx",
      "the whole audience on the slide",
      "Insert > Pictures > This Device",
      "drag a corner handle",
      "every image should have a purpose and should not cover the text"
    ]
  }
];

export const EXAM_DOC_IDS: Record<number, string> = {
  1: "exam-grade-1-mvp3ewmg",
  2: "exam-grade-1-mvp3itwu",
  3: "exam-grade-3-mvp3p2mm",
  4: "test-grade-4-mvrt5umf",
  5: "test-grade-5-mvrt96h1"
};

export const CLASS_LABELS: Record<number, string> = {
  1: "Grade 1",
  2: "Grade 2",
  3: "Grade 3",
  4: "Grade 4",
  5: "Grade 5"
};

export function parseLagosTimestamp(raw: string): { iso: string; timestamp: Timestamp; date: Date } {
  // raw format: "28 October 2026, 11:44:12"
  const m = raw.match(/(\d+)\s+October\s+(\d+),\s+(\d+):(\d+):(\d+)/i);
  if (!m) {
    throw new Error(`Invalid timestamp format: ${raw}`);
  }
  const day = m[1].padStart(2, "0");
  const year = m[2];
  const hour = m[3].padStart(2, "0");
  const minute = m[4].padStart(2, "0");
  const second = m[5].padStart(2, "0");
  const iso = `${year}-10-${day}T${hour}:${minute}:${second}+01:00`;
  const date = new Date(iso);
  const timestamp = Timestamp.fromDate(date);
  return { iso, timestamp, date };
}

export function normalizeText(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function findMatchingOption(options: Array<{ id: string; text: string }>, studentAnswer: string): { id: string; text: string } | null {
  const normAns = normalizeText(studentAnswer);
  if (!normAns) return null;

  // Exact normalized match
  for (const opt of options) {
    if (normalizeText(opt.text) === normAns) {
      return opt;
    }
  }

  // Substring or prefix match
  for (const opt of options) {
    const normOpt = normalizeText(opt.text);
    if (normOpt.includes(normAns) || normAns.includes(normOpt)) {
      return opt;
    }
  }

  return null;
}
