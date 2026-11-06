/* Shared, DOM-free helpers for the reading group web forms.
 *
 * The email body these functions produce is the contract with the engine's
 * parser (see FORMAT.md in the private Reading-Group-Engine repo). Change the
 * two together. Loads in the browser as window.RGForm and in Node via require().
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RGForm = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var FORM_HEADER = "READING-GROUP-FORM";
  var DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  var DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  // Each cell is the START time of a 1-hour meeting, 1 PM to 10 PM Eastern.
  var FIRST_HOUR = 13;
  var LAST_HOUR = 22;
  var HOURS = [];
  for (var h = FIRST_HOUR; h <= LAST_HOUR; h++) HOURS.push(h);
  var MAX_TITLE = 200;
  var MAX_AUTHOR = 200;
  var MAX_NOTE = 500;

  function hourLabel(hour) {
    return ((hour - 1) % 12) + 1 + (hour < 12 ? " AM" : " PM");
  }

  // Collapse all whitespace (including newlines, which would break the block).
  function clean(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function slotKey(day, hour) {
    return day + ":" + hour;
  }

  // "1990s" -> 1990, anything else -> null
  function decadeStart(decade) {
    var m = /^(\d{3})0s?$/.exec(clean(decade));
    return m ? Number(m[1]) * 10 : null;
  }

  function validateSubmission(input, opts) {
    opts = opts || {};
    var currentYear = opts.currentYear || new Date().getFullYear();
    var errors = [];
    var title = clean(input.title);
    var author = clean(input.author);
    var yearText = clean(input.year);
    var note = clean(input.note);

    if (!title) errors.push("Please enter the book's title.");
    else if (title.length > MAX_TITLE) errors.push("The title is too long (over " + MAX_TITLE + " characters).");
    if (!author) errors.push("Please enter the book's author.");
    else if (author.length > MAX_AUTHOR) errors.push("The author is too long (over " + MAX_AUTHOR + " characters).");

    if (!yearText) {
      errors.push("Please enter the publication year.");
    } else if (!/^\d{4}$/.test(yearText)) {
      errors.push("The year must be four digits, like 1989.");
    } else {
      var year = Number(yearText);
      if (year > currentYear) errors.push("The year " + year + " is in the future.");
      var start = decadeStart(opts.decade);
      if (start !== null && (year < start || year > start + 9)) {
        errors.push(
          "This month's decade is the " + clean(opts.decade) + ", so the year must be " +
            start + "–" + (start + 9) + "."
        );
      }
    }
    if (note.length > MAX_NOTE) errors.push("The note is too long (over " + MAX_NOTE + " characters).");

    return { errors: errors, values: { title: title, author: author, year: yearText, note: note } };
  }

  function buildSubmitBody(cycle, values) {
    var lines = [
      FORM_HEADER + ": submit",
      "CYCLE: " + clean(cycle),
      "TITLE: " + values.title,
      "AUTHOR: " + values.author,
      "YEAR: " + values.year,
    ];
    if (values.note) lines.push("NOTE: " + values.note);
    return lines.join("\n") + "\n";
  }

  // input: { ranking: [code|"" ...], wontParticipate: [code ...],
  //          slots: [{day, hour} ...], notAvailable: bool }
  // opts:  { validCodes: [code ...] }
  function validateBallot(input, opts) {
    opts = opts || {};
    var errors = [];
    var warnings = [];
    var validCodes = opts.validCodes ? new Set(opts.validCodes) : null;

    function readCode(raw) {
      var code = clean(raw).toUpperCase();
      if (code && validCodes && !validCodes.has(code)) {
        errors.push("There is no book " + code + " on this ballot.");
        return "";
      }
      return code;
    }

    var ranking = [];
    (input.ranking || []).forEach(function (raw) {
      var code = readCode(raw);
      if (!code) return;
      if (ranking.indexOf(code) !== -1) errors.push("Book " + code + " is chosen for more than one rank.");
      else ranking.push(code);
    });

    var wont = [];
    (input.wontParticipate || []).forEach(function (raw) {
      var code = readCode(raw);
      if (code && wont.indexOf(code) === -1) wont.push(code);
    });
    ranking.forEach(function (code) {
      if (wont.indexOf(code) !== -1) {
        warnings.push("You ranked book " + code + " and also said you wouldn't participate if it's chosen.");
      }
    });

    var slots = new Set();
    (input.slots || []).forEach(function (s) {
      if (s.day >= 0 && s.day < DAYS.length && HOURS.indexOf(s.hour) !== -1) slots.add(slotKey(s.day, s.hour));
    });
    var notAvailable = input.notAvailable === true;
    if (notAvailable && slots.size > 0) {
      errors.push("You ticked \"not free at any of these times\" but also marked some times as free.");
    }

    var hasVote = ranking.length > 0 || wont.length > 0;
    var hasAvailability = slots.size > 0 || notAvailable;
    if (!hasVote && !hasAvailability) {
      errors.push(
        "Rank at least one book, mark the times you're free, or tick \"I'm not free at any of these times\"."
      );
    }

    return {
      errors: errors,
      warnings: warnings,
      values: {
        ranking: ranking,
        wontParticipate: wont,
        slots: slots,
        hasVote: hasVote,
        hasAvailability: hasAvailability,
      },
    };
  }

  // A section is only included when the person filled it in, so sending just
  // a vote never overwrites their earlier availability (and vice versa).
  function buildBallotBody(cycle, values) {
    var lines = [FORM_HEADER + ": ballot", "CYCLE: " + clean(cycle)];
    if (values.hasVote) {
      values.ranking.forEach(function (code, i) {
        lines.push("RANK " + (i + 1) + ": " + code);
      });
      lines.push("WONT-PARTICIPATE-IF: " + (values.wontParticipate.length ? values.wontParticipate.join(", ") : "none"));
    }
    if (values.hasAvailability) {
      DAYS.forEach(function (day, d) {
        var row = HOURS.map(function (hour) {
          return values.slots.has(slotKey(d, hour)) ? "x" : ".";
        }).join("");
        lines.push(day + ": " + row);
      });
    }
    return lines.join("\n") + "\n";
  }

  // Line breaks are CRLF, which is what mail clients expect in a mailto body.
  function mailtoLink(message) {
    return (
      "mailto:" + message.to +
      "?subject=" + encodeURIComponent(message.subject) +
      "&body=" + encodeURIComponent(message.body.replace(/\r?\n/g, "\r\n"))
    );
  }

  return {
    FORM_HEADER: FORM_HEADER,
    DAYS: DAYS,
    DAY_NAMES: DAY_NAMES,
    HOURS: HOURS,
    hourLabel: hourLabel,
    slotKey: slotKey,
    decadeStart: decadeStart,
    validateSubmission: validateSubmission,
    buildSubmitBody: buildSubmitBody,
    validateBallot: validateBallot,
    buildBallotBody: buildBallotBody,
    mailtoLink: mailtoLink,
  };
});
