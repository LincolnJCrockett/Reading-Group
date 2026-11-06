"use strict";
// Run with: node --test tests/site
const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../../docs/form.js");

const OPTS = { currentYear: 2026 };

test("grid is 7 days x 10 start times, 1 PM to 10 PM", () => {
  assert.equal(F.DAYS.length, 7);
  assert.equal(F.HOURS.length, 10);
  assert.equal(F.hourLabel(13), "1 PM");
  assert.equal(F.hourLabel(22), "10 PM");
});

test("decadeStart", () => {
  assert.equal(F.decadeStart("1990s"), 1990);
  assert.equal(F.decadeStart("1990"), 1990);
  assert.equal(F.decadeStart("the nineties"), null);
  assert.equal(F.decadeStart(""), null);
});

test("submission: valid input builds the exact block", () => {
  const { errors, values } = F.validateSubmission(
    { title: "  The Remains   of the Day ", author: "Kazuo Ishiguro", year: "1989", note: "" },
    { ...OPTS, decade: "1980s" }
  );
  assert.deepEqual(errors, []);
  assert.equal(
    F.buildSubmitBody("2026-12", values),
    "READING-GROUP-FORM: submit\nCYCLE: 2026-12\nTITLE: The Remains of the Day\nAUTHOR: Kazuo Ishiguro\nYEAR: 1989\n"
  );
});

test("submission: note is included when present, newlines are flattened", () => {
  const { values } = F.validateSubmission(
    { title: "A", author: "B", year: "1999", note: "line one\nline two" },
    OPTS
  );
  assert.ok(F.buildSubmitBody("2026-12", values).endsWith("NOTE: line one line two\n"));
});

test("submission: errors", () => {
  assert.equal(F.validateSubmission({ title: "", author: "", year: "" }, OPTS).errors.length, 3);
  assert.match(F.validateSubmission({ title: "A", author: "B", year: "89" }, OPTS).errors[0], /four digits/);
  assert.match(F.validateSubmission({ title: "A", author: "B", year: "2027" }, OPTS).errors[0], /future/);
  const outside = F.validateSubmission({ title: "A", author: "B", year: "1979" }, { ...OPTS, decade: "1980s" });
  assert.match(outside.errors[0], /1980–1989/);
  assert.match(F.validateSubmission({ title: "x".repeat(201), author: "B", year: "1999" }, OPTS).errors[0], /too long/);
});

test("a title cannot inject extra lines into the block", () => {
  const { values } = F.validateSubmission(
    { title: "Evil\nREADING-GROUP-FORM: ballot", author: "B", year: "1999" },
    OPTS
  );
  const lines = F.buildSubmitBody("2026-12", values).split("\n");
  assert.equal(lines.filter((l) => l.startsWith("READING-GROUP-FORM")).length, 1);
});

const CODES = ["A", "B", "C", "D"];

test("ballot: vote only (no availability section)", () => {
  const r = F.validateBallot(
    { ranking: ["B", "", "A"], wontParticipate: ["C"], slots: [], notAvailable: false },
    { validCodes: CODES }
  );
  assert.deepEqual(r.errors, []);
  assert.equal(
    F.buildBallotBody("2026-12", r.values),
    "READING-GROUP-FORM: ballot\nCYCLE: 2026-12\nRANK 1: B\nRANK 2: A\nWONT-PARTICIPATE-IF: C\n"
  );
});

test("ballot: availability only, with exact rows", () => {
  const r = F.validateBallot(
    {
      ranking: [],
      wontParticipate: [],
      slots: [{ day: 0, hour: 13 }, { day: 0, hour: 14 }, { day: 6, hour: 22 }],
      notAvailable: false,
    },
    { validCodes: CODES }
  );
  assert.deepEqual(r.errors, []);
  assert.equal(
    F.buildBallotBody("2026-12", r.values),
    [
      "READING-GROUP-FORM: ballot",
      "CYCLE: 2026-12",
      "MON: xx........",
      "TUE: ..........",
      "WED: ..........",
      "THU: ..........",
      "FRI: ..........",
      "SAT: ..........",
      "SUN: .........x",
      "",
    ].join("\n")
  );
});

test("ballot: 'not free at any time' sends a blank grid", () => {
  const r = F.validateBallot({ ranking: ["A"], slots: [], notAvailable: true }, { validCodes: CODES });
  assert.deepEqual(r.errors, []);
  const body = F.buildBallotBody("2026-12", r.values);
  assert.match(body, /MON: \.{10}\n/);
  assert.match(body, /RANK 1: A\nWONT-PARTICIPATE-IF: none\n/);
});

test("ballot: errors", () => {
  assert.match(F.validateBallot({ ranking: ["A", "A"] }, { validCodes: CODES }).errors[0], /more than one rank/);
  assert.match(F.validateBallot({ ranking: ["Z"] }, { validCodes: CODES }).errors[0], /no book Z/);
  assert.match(F.validateBallot({}, { validCodes: CODES }).errors[0], /Rank at least one book/);
  const both = F.validateBallot({ slots: [{ day: 0, hour: 13 }], notAvailable: true }, { validCodes: CODES });
  assert.match(both.errors[0], /not free at any/);
});

test("ballot: ranking a vetoed book is a warning, not an error", () => {
  const r = F.validateBallot({ ranking: ["C"], wontParticipate: ["C"] }, { validCodes: CODES });
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1);
});

test("ballot: out-of-range slots are ignored", () => {
  const r = F.validateBallot({ ranking: ["A"], slots: [{ day: 9, hour: 13 }, { day: 0, hour: 5 }] }, { validCodes: CODES });
  assert.equal(r.values.slots.size, 0);
});

test("mailtoLink encodes and uses CRLF", () => {
  const link = F.mailtoLink({ to: "group@example.com", subject: "A & B", body: "x: 1\ny: 2\n" });
  assert.ok(link.startsWith("mailto:group@example.com?subject=A%20%26%20B&body="));
  const body = decodeURIComponent(link.split("&body=")[1]);
  assert.equal(body, "x: 1\r\ny: 2\r\n");
});
